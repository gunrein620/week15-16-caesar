import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  const port = Number(process.env.API_PORT ?? 3000);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: corsOrigin,
    credentials: true
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LocalMind Board API')
    .setDescription('REST API for the LocalMind Board community service')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);
}

void bootstrap();
