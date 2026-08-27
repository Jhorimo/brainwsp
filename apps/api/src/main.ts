import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const port = Number(process.env.API_PORT || 4000);
  const webOrigin = process.env.WEB_ORIGIN || 'http://localhost:3000';
  // El límite por defecto de body-parser (100kb) se queda corto para adjuntos en base64
  // (ej. sendMessage con PDF, ver MessagesController). BODY_LIMIT es configurable por si
  // algún adjunto necesita más margen.
  const bodyLimit = process.env.BODY_LIMIT || '25mb';

  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({
    origin: webOrigin.split(',').map((value) => value.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BrainWSP API')
    .setDescription('Gateway de WhatsApp, conversaciones, agentes e integraciones BrainPOS/ERP')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port, '0.0.0.0');
  console.log(`BrainWSP API listening on http://localhost:${port}/api`);
  console.log(`Swagger available on http://localhost:${port}/docs`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
