import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Configuration commune à main.ts et aux tests end-to-end. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',') });
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
  return app;
}
