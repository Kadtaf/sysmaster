import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { startMetricsServer } from './shared/observability/metrics.server';

async function main() {
  // LOG_FORMAT=json : une ligne JSON par message, lisible par Loki, CloudWatch ou Elasticsearch.
  const json = process.env.LOG_FORMAT === 'json';
  const app = await NestFactory.create(AppModule, { logger: new ConsoleLogger({ json, colors: !json }) });
  app.use(helmet());
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
