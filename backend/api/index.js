// Vercel serverless entrypoint. Requires ../dist, so `nest build` must run first
// (see vercel.json's buildCommand). Mirrors main.ts's bootstrap(), since that
// file must stay the plain NestJS entrypoint (app.listen()) and can't be
// imported here; the two are kept in sync by hand.
//
// With one deliberate difference: markServingApi() is NOT called here, so the
// timer-driven background runners stay dormant on Vercel. That is not an
// oversight to be tidied up. An instance is frozen between requests, so an
// @Interval only ever fires part-way through some unrelated request and is then
// suspended mid-flight — and ClassificationService counts an attempt on claim,
// so a sweep that is frozen instead of finished silently spends a report's
// retry budget. Classification is drained after a submission instead
// (ClassificationDrainInterceptor, via waitUntil); the nightly forecast runs
// from `npm run forecast:run`.
const express = require('express');
const { ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { ExpressAdapter } = require('@nestjs/platform-express');
const { SwaggerModule } = require('@nestjs/swagger');
const { AppModule } = require('../dist/app.module');
const { buildOpenApiConfig } = require('../dist/openapi.config');

const server = express();
let starting;

async function start() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
  app.set('trust proxy', app.get(ConfigService).get('TRUST_PROXY_HOPS', 0));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(app, buildOpenApiConfig());
  // customCssUrl/customJs load the Swagger UI assets from a CDN instead of
  // node_modules/swagger-ui-dist on disk: Vercel's function bundler only
  // traces the JS require graph, so those static files never reach the
  // deployed serverless function and 404 there without this. Kept in sync
  // with main.ts by hand, same as the rest of this file.
  SwaggerModule.setup('docs', app, document, {
    customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui.min.css',
    customJs: [
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui-bundle.min.js',
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui-standalone-preset.min.js',
    ],
  });

  await app.init();
  return server;
}

module.exports = async (req, res) => {
  if (!starting) starting = start();
  await starting;
  server(req, res);
};
