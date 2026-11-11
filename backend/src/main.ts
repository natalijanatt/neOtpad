import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { markServingApi } from './common/process-role';
import { buildOpenApiConfig } from './openapi.config';

async function bootstrap() {
  // Before the module is created, so a runner that reads it during bootstrap
  // sees the truth. Only this entry point may set it.
  markServingApi();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', app.get(ConfigService).get<number>('TRUST_PROXY_HOPS', 0));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  // Lets SIGTERM drain in-flight requests and close the Postgres pool
  // (devops-graceful-shutdown). Without this the pool is only closed when the
  // process is killed, which loses connections on every redeploy.
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(app, buildOpenApiConfig());
  // customCssUrl/customJs load the Swagger UI assets from a CDN instead of
  // node_modules/swagger-ui-dist on disk: Vercel's function bundler only
  // traces the JS require graph, so those static files never reach the
  // deployed serverless function and 404 there without this.
  SwaggerModule.setup('docs', app, document, {
    customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui.min.css',
    customJs: [
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui-bundle.min.js',
      'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13/swagger-ui-standalone-preset.min.js',
    ],
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
