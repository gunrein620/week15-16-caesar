import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd, loadEnvFile } from 'node:process';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

loadNearestEnvFile();

async function bootstrap() {
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule);
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  const port = Number(process.env.API_PORT ?? 3000);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );
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

function loadNearestEnvFile() {
  let directory = cwd();
  while (true) {
    const envPath = join(directory, '.env');
    if (existsSync(envPath)) {
      loadEnvFile(envPath);
      return;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      return;
    }
    directory = parent;
  }
}
