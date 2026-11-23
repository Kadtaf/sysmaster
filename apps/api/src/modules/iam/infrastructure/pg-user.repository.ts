import { ForbiddenException, Injectable } from '@nestjs/common';
import { Database } from '../../../shared/database.module';
import { UserProfile, UserRepository } from '../application/ports';
import { AuthenticatedUser, GlobalRole, knownRoles, TokenClaims } from '../domain/identity';

@Injectable()
export class PgUserRepository extends UserRepository {
  constructor(private readonly db: Database) {
    super();
  }

  provision(c: TokenClaims): Promise<AuthenticatedUser> {
    return this.db.transaction(async (tx) => {
      let id: string | undefined = (
        await tx.query<{ id: string }>('SELECT id FROM iam.users WHERE idp_subject = $1 FOR UPDATE', [c.subject])
      ).rows[0]?.id;

      if (!id) {
        // Compte existant (données importées, licence école…) : on le relie, mais seulement si
        // Keycloak garantit que l'e-mail appartient bien à la personne. Sinon, prise de contrôle possible.
        const existing = (
          await tx.query<{ id: string; idp_subject: string | null }>(
            'SELECT id, idp_subject FROM iam.users WHERE email = $1 FOR UPDATE',
            [c.email],
          )
        ).rows[0];
        if (existing) {
          if (!c.emailVerified || existing.idp_subject) {
            throw new ForbiddenException('Cet e-mail est déjà associé à un autre compte ou n\'est pas vérifié.');
          }
          id = existing.id;
          await tx.query('UPDATE iam.users SET idp_subject = $2 WHERE id = $1', [id, c.subject]);
        }
      }

      if (id) {
        await tx.query(
          `UPDATE iam.users SET email = $2, email_verified = $3, display_name = $4, last_login_at = now()
            WHERE id = $1`,
          [id, c.email, c.emailVerified, c.displayName],
        );
      } else {
        id = (
          await tx.query<{ id: string }>(
            `INSERT INTO iam.users (idp_subject, email, email_verified, display_name, locale, last_login_at)
             VALUES ($1, $2, $3, $4, $5, now()) RETURNING id`,
            [c.subject, c.email, c.emailVerified, c.displayName, c.locale ?? 'fr'],
          )
        ).rows[0].id;
        await tx.query(
          `INSERT INTO platform.outbox_events (aggregate, aggregate_id, type, payload)
           VALUES ('iam.user', $1, 'iam.user.registered.v1', $2)`,
          [id, JSON.stringify({ userId: id, email: c.email, locale: c.locale ?? 'fr' })],
        );
      }

      // Keycloak fait foi pour les rôles « idp » ; les rôles « local » (attribués dans l'app) sont conservés.
      await tx.query(
        `DELETE FROM iam.user_roles WHERE user_id = $1 AND source = 'idp' AND NOT (role_code = ANY($2::text[]))`,
        [id, c.roles],
      );
      if (c.roles.length) {
        await tx.query(
          `INSERT INTO iam.user_roles (user_id, role_code, source)
           SELECT $1, unnest($2::text[]), 'idp' ON CONFLICT DO NOTHING`,
          [id, c.roles],
        );
      }
      const roles = (
        await tx.query<{ role_code: string }>('SELECT role_code FROM iam.user_roles WHERE user_id = $1', [id])
      ).rows.map((r) => r.role_code);

      return { id, subject: c.subject, email: c.email, displayName: c.displayName, roles: knownRoles(roles) as GlobalRole[] };
    });
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT u.id, u.idp_subject, u.email, u.display_name, u.locale, u.created_at,
              coalesce(array_agg(r.role_code) FILTER (WHERE r.role_code IS NOT NULL), '{}') AS roles
         FROM iam.users u LEFT JOIN iam.user_roles r ON r.user_id = u.id
        WHERE u.id = $1 GROUP BY u.id`,
      [userId],
    );
    const u = rows[0];
    if (!u) return null;
    const ent = await this.db.query<Record<string, any>>(
      `SELECT feature, value, source FROM iam.entitlements
        WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now()) ORDER BY feature`,
      [userId],
    );
    return {
      id: u.id,
      subject: u.idp_subject,
      email: u.email,
      displayName: u.display_name,
      locale: u.locale,
      createdAt: u.created_at.toISOString(),
      roles: knownRoles(u.roles),
      entitlements: ent.rows.map((e) => ({ feature: e.feature, value: e.value, source: e.source })),
    };
  }

  async list(limit: number) {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT u.id, u.email, u.display_name, u.created_at,
              coalesce(array_agg(r.role_code ORDER BY r.role_code) FILTER (WHERE r.role_code IS NOT NULL), '{}') AS roles
         FROM iam.users u LEFT JOIN iam.user_roles r ON r.user_id = u.id
        WHERE u.status = 'active' GROUP BY u.id ORDER BY u.created_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      roles: u.roles,
      createdAt: u.created_at.toISOString(),
    }));
  }
}
