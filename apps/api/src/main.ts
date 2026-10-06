import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createCorsOriginValidator } from './common/cors-origin';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const port = Number(process.env.API_PORT || 4000);
  // El límite por defecto de body-parser (100kb) se queda corto para adjuntos en base64
  // (ej. sendMessage con PDF, ver MessagesController). BODY_LIMIT es configurable por si
  // algún adjunto necesita más margen.
  const bodyLimit = process.env.BODY_LIMIT || '25mb';

  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // El widget de Clienera Chat se embebe en webs de terceros (dominio desconocido de
  // antemano) — sus rutas bajo /api/widget necesitan CORS abierto, a diferencia del resto
  // de la API, que sigue restringida a WEB_ORIGIN. `origin: true` refleja dinámicamente
  // el Origin de cada request (equivalente a "*" pero válido también si algún día se
  // necesitara credentials en esa ruta); no lleva cookies ni JWT, solo el token propio del
  // visitante en el body, así que abrir el origin no expone nada de otra empresa.
  const strictCorsOrigin = createCorsOriginValidator();
  app.enableCors((req: { url?: string }, callback: (err: Error | null, options: Record<string, unknown>) => void) => {
    const isWidgetRoute = req.url?.startsWith('/api/widget/');
    callback(null, {
      origin: isWidgetRoute ? true : strictCorsOrigin,
      credentials: !isWidgetRoute,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
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
