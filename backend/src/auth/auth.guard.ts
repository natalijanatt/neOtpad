import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import type { StaffDto } from './auth.dto';
import { AuthService } from './auth.service';

const ROLES = 'auth.roles';
export const DispatcherOnly = () => SetMetadata(ROLES, ['admin', 'dispecer']);
/**
 * Stricter than DispatcherOnly: for actions that reach citizens directly, such
 * as publishing news, where an SMS already sent cannot be recalled.
 */
export const AdminOnly = () => SetMetadata(ROLES, ['admin']);
type StaffRequest = Request & { staff: StaffDto };
export const CurrentStaff = createParamDecorator((_data: unknown, context: ExecutionContext): StaffDto => context.switchToHttp().getRequest<StaffRequest>().staff);

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly auth: AuthService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Bearer token required');
    let subject: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(match[1]!);
      if (typeof payload.sub !== 'string' || !isUUID(payload.sub)) throw new Error('Invalid subject');
      subject = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    request.staff = await this.auth.identity(subject);
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES, [context.getHandler(), context.getClass()]);
    // The message names the role the route actually wants: "dispatcher access
    // required" on an admin-only route sends the reader looking for the wrong fix.
    if (roles && !roles.includes(request.staff.uloga)) {
      throw new ForbiddenException(roles.includes('dispecer') ? 'Dispatcher access required' : 'Administrator access required');
    }
    return true;
  }
}
