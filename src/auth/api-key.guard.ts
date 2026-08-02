import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '@/auth/roles.decorator';
import { Role } from '@/auth/roles';
import { ApiKeyRegistry } from '@/auth/api-key.registry';

interface AuthenticatedRequest extends Request {
  principal?: { role: Role };
}

/**
 * Opt-in API key + role guard registered globally. A route is public unless it
 * (or its controller) carries @Roles(...). Protected routes require an
 * `Authorization: Bearer <key>` (or `X-API-Key`) header whose key maps to one of
 * the accepted roles: a missing/unknown key is a 401, a valid key without the
 * required role is a 403.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly registry: ApiKeyRegistry,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true; // public route
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = this.extractKey(request);
    if (!key) {
      throw new UnauthorizedException('Missing API key');
    }
    const role = this.registry.roleFor(key);
    if (!role) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (!required.includes(role)) {
      throw new ForbiddenException('Insufficient role');
    }

    request.principal = { role };
    return true;
  }

  private extractKey(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim() || undefined;
    }
    const apiKey = request.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey.trim()) {
      return apiKey.trim();
    }
    return undefined;
  }
}
