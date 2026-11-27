import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { requestContext } from './shared/observability/request-context.middleware';

/**
 * Proxys de confiance devant l'API (TRUST_PROXY, valeur d'Express « trust proxy ») : nombre de sauts
 * (1 derrière l'ingress), liste d'adresses, ou false. Sans proxy déclaré, X-Forwarded-For est ignoré,
 * sinon n'importe qui choisirait l'adresse IP qui sert de clé à la limitation de débit.
 */
export function trustProxy(value = process.env.TRUST_PROXY): boolean | number | string {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

/** La documentation OpenAPI est publique hors production ; en production, seulement avec API_DOCS=true. */
export function docsEnabled(env = process.env): boolean {
  return env.API_DOCS === 'true' || (env.NODE_ENV !== 'production' && env.API_DOCS !== 'false');
}

const apiHelmet = helmet({
  contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
});
const docsHelmet = helmet();

/** Configuration commune à main.ts et aux tests end-to-end. */
export function configureApp(app: INestApplication) {
  (app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void }).set('trust proxy', trustProxy());
  // En-têtes de sécurité. L'API ne sert que du JSON : la politique de contenu peut être la plus stricte,
  // sauf sur /api/docs dont l'interface charge ses propres scripts et styles.
  app.use((req: { url?: string }, res: unknown, next: () => void) =>
    (req.url?.startsWith('/api/docs') ? docsHelmet : apiHelmet)(req as never, res as never, next),
  );
  app.use(requestContext);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',') });
  if (docsEnabled()) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('SysMaster API')
        .setDescription('Apprendre, comprendre, diagnostiquer, réparer.')
        .setVersion('0.2.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }
  return app;
}
