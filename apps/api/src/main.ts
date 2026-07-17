import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';

import { AppModule } from './app.module';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Security headers. crossOriginResourcePolicy is relaxed so a separately hosted
  // web origin can load short-lived protected media responses from the API origin.
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

  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.headers.authorization || request.headers['x-unlock-token']) {
      response.setHeader('Cache-Control', 'private, no-store, max-age=0');
      response.setHeader('Pragma', 'no-cache');
    }
    next();
  });

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

  setupSwagger(app);

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  console.log(`PressPass API is running on http://localhost:${port} (docs at /docs)`);
}

void bootstrap();
