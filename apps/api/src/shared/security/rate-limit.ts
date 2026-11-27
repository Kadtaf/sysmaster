import { CallHandler, ExecutionContext, HttpException, HttpStatus, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';

/**
 * Limitation de débit (docs/01 §15, OWASP ASVS 11.1). Fenêtre fixe en mémoire, par personne
 * connectée, sinon par adresse IP. Elle protège chaque instance contre le martèlement d'un
 * client ; les plafonds métier durables (quota IA du jour, sujets par heure) restent en base.
 * Avec N instances, un client peut aller jusqu'à N fois la limite : c'est accepté, la limite vise
 * les abus, pas la facturation.
 */

export interface RateLimitRule {
  /** Nom du compteur : deux routes du même nom partagent la limite. */
  bucket: string;
  limit: number;
  windowS: number;
}

export const RATE_LIMIT = 'sysmaster:rate-limit';

/** Limite propre à une route, en plus de la limite générale. */
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT, rule);

/** Limites des routes coûteuses ou sensibles, réunies ici pour être relues d'un coup d'œil. */
export const LIMITS = {
  /** Questions à l'assistant et analyses de diagnostic : un appel au modèle chacune. */
  ai: { bucket: 'ai', limit: 20, windowS: 60 },
  /** Génération de quiz ou de lab par l'IA (back-office). */
  aiAuthoring: { bucket: 'ai-authoring', limit: 10, windowS: 300 },
  /** Vérification publique d'un certificat : empêche de parcourir les numéros de série. */
  certificateLookup: { bucket: 'certificate-lookup', limit: 30, windowS: 60 },
  /** Rejoindre un groupe privé par son code : empêche de deviner les codes d'invitation. */
  groupJoinCode: { bucket: 'group-join-code', limit: 10, windowS: 600 },
  /** Export RGPD : une trentaine de requêtes en base par export. */
  privacyExport: { bucket: 'privacy-export', limit: 5, windowS: 3600 },
  /** Ouvrir une page de paiement ou le portail Stripe : chaque appel crée une session chez Stripe. */
  billing: { bucket: 'billing', limit: 10, windowS: 600 },
  /** Démarrer un examen. */
  examStart: { bucket: 'exam-start', limit: 10, windowS: 3600 },
} satisfies Record<string, RateLimitRule>;

interface Window {
  start: number;
  count: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private lastSweep = 0;

  constructor(private readonly maxKeys = 100_000) {}

  /** Consomme une unité. Renvoie le nombre de secondes à attendre si la limite est atteinte. */
  hit(key: string, rule: Pick<RateLimitRule, 'limit' | 'windowS'>, now = Date.now()): { allowed: boolean; remaining: number; retryAfterS: number } {
    this.sweep(now);
    const span = rule.windowS * 1000;
    let w = this.windows.get(key);
    if (!w || now - w.start >= span) {
      w = { start: now, count: 0 };
      this.windows.set(key, w);
    }
    w.count += 1;
    const retryAfterS = Math.max(1, Math.ceil((w.start + span - now) / 1000));
    return { allowed: w.count <= rule.limit, remaining: Math.max(0, rule.limit - w.count), retryAfterS };
  }

  get size() {
    return this.windows.size;
  }

  /** Oublie les fenêtres de plus d'une heure, au plus une fois par minute ; vide tout si la carte déborde. */
  private sweep(now: number) {
    if (this.windows.size >= this.maxKeys) this.windows.clear();
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, w] of this.windows) if (now - w.start > 3_600_000) this.windows.delete(k);
  }
}

/** Limite générale par minute, réglable (RATE_LIMIT_PER_MINUTE, 0 la désactive). */
export function defaultRule(env = process.env): RateLimitRule | null {
  const limit = Number(env.RATE_LIMIT_PER_MINUTE ?? 600);
  return limit > 0 ? { bucket: 'all', limit, windowS: 60 } : null;
}

interface LimitedRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  user?: { id: string } | null;
}

interface LimitedResponse {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly limiter = new RateLimiter();
  private readonly general = defaultRule();

  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<LimitedRequest>();
    const res = ctx.switchToHttp().getResponse<LimitedResponse>();
    // Les intercepteurs passent après la garde d'authentification : req.user est déjà connu.
    const who = req.user?.id ? `u:${req.user.id}` : `ip:${req.ip ?? req.socket?.remoteAddress ?? 'inconnue'}`;
    const specific = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT, [ctx.getHandler(), ctx.getClass()]);

    for (const rule of [specific, this.general]) {
      if (!rule) continue;
      const r = this.limiter.hit(`${rule.bucket}|${who}`, rule);
      if (rule === specific) {
        res.setHeader('RateLimit-Limit', String(rule.limit));
        res.setHeader('RateLimit-Remaining', String(r.remaining));
      }
      if (!r.allowed) {
        res.setHeader('Retry-After', String(r.retryAfterS));
        throw new HttpException(`Trop de requêtes. Réessayez dans ${r.retryAfterS} s.`, HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    return next.handle();
  }
}
