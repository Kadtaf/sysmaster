import { Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { BillingInvoiceDto, SubscriptionStatus } from '@sysmaster/contracts';
import { Database } from '../../../shared/database.module';
import { isStale } from '../domain/billing';
import { BillingEvent, BillingRepository, PlanRow, StoredSubscription, VerifiedEvent } from '../application/ports';

@Injectable()
export class PgBillingRepository extends BillingRepository {
  private readonly logger = new Logger(PgBillingRepository.name);

  constructor(private readonly db: Database) {
    super();
  }

  async plans(): Promise<PlanRow[]> {
    const { rows } = await this.db.query<{
      code: string; name: string; price_cents: number | null; currency: string; interval: 'month' | 'year' | null; per_seat: boolean; features: Record<string, unknown>;
    }>(
      `SELECT code, name, price_cents, currency, interval, per_seat, features FROM billing.plans
        WHERE is_public ORDER BY price_cents IS NULL, price_cents, code`,
    );
    return rows.map((r) => ({ code: r.code, name: r.name, priceCents: r.price_cents, currency: r.currency, interval: r.interval, perSeat: r.per_seat, features: r.features }));
  }

  async features(plan: string): Promise<Record<string, unknown>> {
    const { rows } = await this.db.query<{ features: Record<string, unknown> }>(`SELECT features FROM billing.plans WHERE code = $1`, [plan]);
    return rows[0]?.features ?? {};
  }

  async customerId(userId: string): Promise<string | null> {
    const { rows } = await this.db.query<{ stripe_customer_id: string }>(`SELECT stripe_customer_id FROM billing.customers WHERE user_id = $1`, [userId]);
    return rows[0]?.stripe_customer_id ?? null;
  }

  async linkCustomer(userId: string, customerId: string): Promise<string> {
    const { rows } = await this.db.query<{ stripe_customer_id: string }>(
      `INSERT INTO billing.customers (user_id, stripe_customer_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING stripe_customer_id`,
      [userId, customerId],
    );
    return rows[0].stripe_customer_id;
  }

  async subscriptions(userId: string): Promise<StoredSubscription[]> {
    const { rows } = await this.db.query<{
      stripe_subscription_id: string; plan_code: string; status: SubscriptionStatus; current_period_end: Date | null; cancel_at_period_end: boolean;
    }>(
      `SELECT s.stripe_subscription_id, s.plan_code, s.status, s.current_period_end, s.cancel_at_period_end
         FROM billing.subscriptions s JOIN billing.customers c ON c.id = s.customer_id
        WHERE c.user_id = $1 ORDER BY s.created_at DESC`,
      [userId],
    );
    return rows.map((r) => ({
      stripeSubscriptionId: r.stripe_subscription_id, plan: r.plan_code, status: r.status, currentPeriodEnd: r.current_period_end, cancelAtPeriodEnd: r.cancel_at_period_end,
    }));
  }

  async invoices(userId: string, limit: number): Promise<BillingInvoiceDto[]> {
    const { rows } = await this.db.query<{ amount_cents: number; currency: string; status: string; issued_at: Date; hosted_url: string | null; pdf_url: string | null }>(
      `SELECT i.amount_cents, i.currency, i.status, i.issued_at, i.hosted_url, i.pdf_url
         FROM billing.invoices i JOIN billing.customers c ON c.id = i.customer_id
        WHERE c.user_id = $1 AND i.status <> 'draft' ORDER BY i.issued_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r) => ({ amountCents: r.amount_cents, currency: r.currency, status: r.status, issuedAt: r.issued_at.toISOString(), url: r.hosted_url ?? r.pdf_url }));
  }

  applyEvent(e: VerifiedEvent, planForPrice: (priceId: string) => string | null): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // Idempotence : Stripe renvoie un événement tant qu'il n'a pas reçu 2xx, parfois plusieurs fois.
      const first = await tx.query(
        `INSERT INTO billing.stripe_webhook_events (stripe_event_id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1`,
        [e.id, e.type],
      );
      if (!first.rowCount) return false;
      if (e.event) await this.apply(tx, e.event, e.createdAt, planForPrice);
      await tx.query(`UPDATE billing.stripe_webhook_events SET processed_at = now() WHERE stripe_event_id = $1`, [e.id]);
      return true;
    });
  }

  /** Client interne d'un client Stripe ; le crée depuis l'identifiant de la personne s'il manque. */
  private async customerRow(tx: PoolClient, stripeCustomerId: string, userId: string | null): Promise<string | null> {
    const found = await tx.query<{ id: string }>(`SELECT id FROM billing.customers WHERE stripe_customer_id = $1`, [stripeCustomerId]);
    if (found.rows[0]) return found.rows[0].id;
    if (!userId) return null;
    const user = await tx.query(`SELECT 1 FROM iam.users WHERE id = $1`, [userId]);
    if (!user.rowCount) return null;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO billing.customers (user_id, stripe_customer_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
      [userId, stripeCustomerId],
    );
    return rows[0].id;
  }

  private async apply(tx: PoolClient, ev: BillingEvent, at: Date, planForPrice: (priceId: string) => string | null) {
    switch (ev.kind) {
      case 'checkout_completed': {
        await this.customerRow(tx, ev.customerId, ev.userId);
        return;
      }
      case 'subscription': {
        const customer = await this.customerRow(tx, ev.customerId, ev.userId);
        if (!customer) {
          this.logger.warn(`Abonnement ${ev.subscriptionId} : client Stripe ${ev.customerId} inconnu, ignoré.`);
          return;
        }
        const plan = ev.priceId ? planForPrice(ev.priceId) : null;
        if (!plan) {
          // Un prix absent de STRIPE_PRICES : on ne devine pas l'offre. L'erreur annule la transaction,
          // Stripe renvoie l'événement pendant trois jours : le temps de compléter STRIPE_PRICES.
          throw new Error(`Abonnement ${ev.subscriptionId} : prix ${ev.priceId} absent de STRIPE_PRICES. Complétez-le ; Stripe renverra l'événement.`);
        }
        const prev = await tx.query<{ last_event_at: Date | null }>(
          `SELECT last_event_at FROM billing.subscriptions WHERE stripe_subscription_id = $1 FOR UPDATE`,
          [ev.subscriptionId],
        );
        if (prev.rows[0] && isStale(prev.rows[0].last_event_at, at)) return;
        await tx.query(
          `INSERT INTO billing.subscriptions
             (customer_id, plan_code, stripe_subscription_id, stripe_price_id, status, current_period_end, cancel_at_period_end, last_event_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (stripe_subscription_id) DO UPDATE SET
             plan_code = EXCLUDED.plan_code, stripe_price_id = EXCLUDED.stripe_price_id, status = EXCLUDED.status,
             current_period_end = EXCLUDED.current_period_end, cancel_at_period_end = EXCLUDED.cancel_at_period_end,
             last_event_at = EXCLUDED.last_event_at, updated_at = now()`,
          [customer, plan, ev.subscriptionId, ev.priceId, ev.status, ev.currentPeriodEnd, ev.cancelAtPeriodEnd, at],
        );
        return;
      }
      case 'invoice': {
        const customer = await this.customerRow(tx, ev.customerId, null);
        if (!customer) return;
        await tx.query(
          `INSERT INTO billing.invoices (customer_id, stripe_invoice_id, amount_cents, currency, status, hosted_url, issued_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (stripe_invoice_id) DO UPDATE SET
             amount_cents = EXCLUDED.amount_cents, hosted_url = EXCLUDED.hosted_url,
             -- « finalized » arrivé après « paid » ne rouvre pas une facture réglée ou annulée.
             status = CASE WHEN billing.invoices.status IN ('paid', 'void') AND EXCLUDED.status = 'open'
                           THEN billing.invoices.status ELSE EXCLUDED.status END`,
          [customer, ev.invoiceId, ev.amountCents, ev.currency, ev.status, ev.url, ev.issuedAt],
        );
        return;
      }
    }
  }
}
