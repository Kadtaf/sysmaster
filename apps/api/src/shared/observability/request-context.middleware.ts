import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { httpDuration } from './metrics';

// Types minimaux d'Express (évite une dépendance de types pour trois champs).
type Request = IncomingMessage & { method: string; baseUrl?: string; route?: { path?: string } };
type Response = ServerResponse;
type NextFunction = () => void;

const logger = new Logger('HTTP');
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Motif de route Express, ou « unmatched » pour une URL inconnue (évite une série par URL tapée au hasard). */
export function routeOf(req: Request): string {
  return req.route?.path ? `${req.baseUrl ?? ''}${req.route.path}` : 'unmatched';
}

/**
 * Identifiant de requête (repris de l'en-tête x-request-id s'il est sain, sinon généré),
 * renvoyé au client, journal d'accès et métrique de durée. Les sondes de santé ne sont pas journalisées.
 */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['x-request-id'];
  const incoming = Array.isArray(header) ? header[0] : header;
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = routeOf(req);
    httpDuration.observe({ method: req.method, route, status: String(res.statusCode) }, seconds);
    if (route.includes('/health')) return;
    const line = `${req.method} ${route} ${res.statusCode} ${(seconds * 1000).toFixed(1)} ms requestId=${id}`;
    if (res.statusCode >= 500) logger.error(line);
    else logger.log(line);
  });
  next();
}
