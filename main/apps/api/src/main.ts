import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import * as express from 'express';
import * as path from 'path';

import { AppModule } from './app.module';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Security headers. crossOriginResourcePolicy is relaxed so the web app
  // (different origin) can load photos from /uploads.
  // On plain-HTTP deployments (LAN/IP without a certificate) the CSP
  // `upgrade-insecure-requests` directive must be dropped: browsers would
  // rewrite Swagger asset URLs to https:// and fail with connection refused.
  // localhost is exempt from upgrades, so the issue only shows on real hosts.
  const isHttpsDeployment = config
    .get<string>('VERIFY_BASE_URL', 'https://id.domain.ua')
    .startsWith('https://');
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      ...(isHttpsDeployment
        ? {}
        : {
            contentSecurityPolicy: {
              useDefaults: true,
              directives: { upgradeInsecureRequests: null },
            },
            // COOP is ignored on untrustworthy (http) origins anyway;
            // disabling it removes the browser console warning.
            crossOriginOpenerPolicy: false,
          }),
    }),
  );

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000').split(','),
    credentials: true,
  });

  // Reject unknown properties and transform payloads into DTO instances.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Uploaded photos are served as static files; only paths live in the DB.
  const uploadsDir = path.resolve(process.cwd(), config.get<string>('UPLOADS_DIR', './uploads'));
  app.use('/uploads', express.static(uploadsDir, { fallthrough: false, index: false }));

  setupSwagger(app);

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  console.log(`PressPass API is running on http://localhost:${port} (docs at /docs)`);
}

void bootstrap();
