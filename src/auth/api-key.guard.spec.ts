import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from '@/auth/api-key.guard';
import { ApiKeyRegistry } from '@/auth/api-key.registry';
import { Role } from '@/auth/roles';

function makeContext(headers: Record<string, string | undefined>): {
  ctx: ExecutionContext;
  request: Record<string, unknown>;
} {
  const request: Record<string, unknown> = { headers };
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

function guardWith(required: Role[] | undefined): ApiKeyGuard {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const registry = {
    roleFor: (key: string) =>
      key === 'admin-key' ? 'admin' : key === 'ingest-key' ? 'ingest' : undefined,
  } as unknown as ApiKeyRegistry;
  return new ApiKeyGuard(reflector, registry);
}

describe('ApiKeyGuard', () => {
  it('allows public routes with no @Roles metadata', () => {
    const guard = guardWith(undefined);
    const { ctx } = makeContext({});

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects a protected route when no key is present', () => {
    const guard = guardWith(['admin']);
    const { ctx } = makeContext({});

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects an unknown key', () => {
    const guard = guardWith(['admin']);
    const { ctx } = makeContext({ authorization: 'Bearer bogus' });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects a valid key that lacks the required role', () => {
    const guard = guardWith(['admin']);
    const { ctx } = makeContext({ authorization: 'Bearer ingest-key' });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('accepts a bearer key with the required role and attaches the principal', () => {
    const guard = guardWith(['admin']);
    const { ctx, request } = makeContext({ authorization: 'Bearer admin-key' });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.principal).toEqual({ role: 'admin' });
  });

  it('accepts the X-API-Key header as an alternative', () => {
    const guard = guardWith(['admin', 'ingest']);
    const { ctx, request } = makeContext({ 'x-api-key': 'ingest-key' });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.principal).toEqual({ role: 'ingest' });
  });
});
