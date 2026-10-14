import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const uploadDirectory = resolve(
    process.env.UPLOAD_DIR ?? '../../storage/uploads',
  );
  await mkdir(resolve(uploadDirectory, 'tmp'), {
    recursive: true,
  });
  const port = Number(process.env.PORT ?? 3003);
  await app.listen(port, '127.0.0.1');
  console.log(`CheckMate API listening on http://localhost:${port}/api`);
}

void bootstrap();
