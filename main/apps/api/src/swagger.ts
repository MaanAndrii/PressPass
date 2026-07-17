import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/** Configures Swagger UI at /docs and returns the OpenAPI document. */
export function setupSwagger(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('PressPass API')
    .setDescription(
      'REST API for issuing, administration and verification of electronic press credentials.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication')
    .addTag('me', 'Journalist self-service')
    .addTag('verify', 'Public card verification')
    .addTag('admin/journalists', 'Journalist administration')
    .addTag('admin/cards', 'Card administration')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  return document;
}
