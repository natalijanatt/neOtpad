import { CanActivate, ExecutionContext, HttpException, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHmac } from 'node:crypto';
import { sql } from 'kysely';
import type { Request, Response } from 'express';
import { DATABASE, type Database } from '../database/database.module';

interface Limit { scope: string; count: number; seconds: number }
const RATE_LIMIT = 'api.rate-limit';
export const RateLimit = (scope: string, count: number, seconds: number) => SetMetadata(RATE_LIMIT, { scope, count, seconds });

@Injectable()
export class RateLimitService {
  constructor(@Inject(DATABASE) private readonly db: Database, private readonly config: ConfigService) {}

  async consume(identity: string, limit: Limit): Promise<void> {
    const key = createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`${limit.scope}:${identity}`).digest('hex');
    const result = await sql<{ broj: number; retry_after: number }>`
      insert into app.api_limit (kljuc, broj, istice_at)
      values (${key}, 1, now() + ${limit.seconds} * interval '1 second')
      on conflict (kljuc) do update set
        broj = case when app.api_limit.istice_at <= now() then 1 else least(app.api_limit.broj + 1, ${limit.count + 1}) end,
        istice_at = case when app.api_limit.istice_at <= now() then now() + ${limit.seconds} * interval '1 second' else app.api_limit.istice_at end
      returning broj, greatest(1, ceil(extract(epoch from (istice_at - now()))))::integer as retry_after
    `.execute(this.db);
    const row = result.rows[0]!;
    if (row.broj > limit.count) {
      throw new HttpException({ statusCode: 429, message: 'Too many requests', retryAfter: row.retry_after }, 429);
    }
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly limits: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limit = this.reflector.get<Limit>(RATE_LIMIT, context.getHandler());
    if (!limit) return true;
    const request = context.switchToHttp().getRequest<Request>();
    try {
      await this.limits.consume(request.ip ?? request.socket.remoteAddress ?? 'unknown', limit);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) {
        const body = error.getResponse() as { retryAfter: number };
        context.switchToHttp().getResponse<Response>().setHeader('Retry-After', body.retryAfter);
      }
      throw error;
    }
    return true;
  }
}
