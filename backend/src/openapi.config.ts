import { DocumentBuilder } from '@nestjs/swagger';

/**
 * The contract version. This constant is the source of truth: the generator
 * writes it into contracts/openapi.json (info.version) and mirrors it into
 * contracts/package.json, so the published contract version can never drift
 * from the spec it describes.
 *
 * Bump minor for additive changes, major for breaking ones. The CI oasdiff
 * check is what decides which of the two a change actually is.
 */
export const API_VERSION = '0.8.0';

/**
 * Shared between the runtime Swagger UI (main.ts) and the spec generator
 * (scripts/generate-openapi.ts). Both MUST use this builder, otherwise the
 * served docs and the committed contract describe different APIs.
 */
export function buildOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle('Hackaton API')
    .setDescription(
      'Contract-first API. This document is generated from the NestJS source; it is never hand-edited.',
    )
    .setVersion(API_VERSION)
    .addServer('http://localhost:3000', 'Local development')
    .addTag('health', 'Service liveness and metadata.')
    .addTag('routes', 'Daily route plans: risk-weighted stop selection, one route per vehicle.')
    .addTag('auth', 'Utility staff authentication.')
    .addTag('reports', 'Citizen reports and dispatcher triage.')
    .addTag('lookups', 'Reference data for reporting.')
    .addTag('containers', 'The container fleet: where each one stands, how full it is and when it was last emptied.')
    .addTag('forecasts', 'Container fill forecasting: the curve and the expected time of overflow.')
    .addTag('news', 'Utility news for citizens; published by administrators.')
    .addTag('disposal', 'Where does this go: free-text material recognition for citizens.')
    .addTag('collectors', 'Collectors of materials the utility does not take; managed by administrators.')
    .addTag('risk', 'Risk scores and black spots: recurring locations and the action each one calls for.')
    .addTag('dumps', 'The historical illegal-dump register, merged from the Pirot datasets.')
    .addBearerAuth()
    .build();
}
