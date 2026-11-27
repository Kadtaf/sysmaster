import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { startMetricsServer } from './shared/observability/metrics.server';
import { productionConfigProblems } from './shared/security/production-config';

async function main() {
  const problems = productionConfigProblems();
  if (problems.length) {
    for (const p of problems) Logger.error(p, 'Configuration');
    process.exit(1);
  }
  // LOG_FORMAT=json : une ligne JSON par message, lisible par Loki, CloudWatch ou Elasticsearch.
  const json = process.env.LOG_FORMAT === 'json';
  // rawBody : la signature des webhooks Stripe se vérifie sur le corps exact reçu.
  const app = await NestFactory.create(AppModule, { logger: new ConsoleLogger({ json, colors: !json }), rawBody: true });
  app.enableShutdownHooks();
  configureApp(app);
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  const metricsPort = Number(process.env.METRICS_PORT ?? 9464);
  if (metricsPort > 0) {
    const metrics = startMetricsServer(metricsPort);
    app.getHttpServer().on('close', () => metrics.close());
  }
  Logger.log(`API prête sur http://localhost:${port}/api/v1 — documentation : /api/docs`, 'Bootstrap');
}
void main();
