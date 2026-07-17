/**
 * Generates docs/openapi.json from the live application metadata,
 * without starting an HTTP server or touching the database.
 *
 * Usage: npm run openapi:generate
 */
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';

import { AppModule } from './app.module';
import { setupSwagger } from './swagger';

async function generate(): Promise<void> {
  process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/placeholder';
  process.env.JWT_SECRET ??= 'openapi-generation-only';

  // Lifecycle hooks (and thus the DB connection) run only on app.init()/listen(),
  // which we never call here — creating the app is enough to build the document.
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = setupSwagger(app);

  const outFile = path.resolve(__dirname, '../../../docs/openapi.json');
  fs.writeFileSync(outFile, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`OpenAPI spec written to ${outFile}`);
  await app.close();
}

void generate();
