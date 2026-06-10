import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cwd, loadEnvFile } from 'node:process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

loadNearestEnvFile();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.MCP_SERVER_PORT ?? 3010);

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
