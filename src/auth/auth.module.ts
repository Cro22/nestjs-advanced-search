import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyRegistry } from '@/auth/api-key.registry';
import { ApiKeyGuard } from '@/auth/api-key.guard';

/**
 * Registers the API key guard as a global guard. It is opt-in per route via
 * @Roles, so public endpoints (search, autocomplete, health) are unaffected.
 * Global so the registry and guard are available everywhere without re-importing.
 */
@Global()
@Module({
  providers: [ApiKeyRegistry, { provide: APP_GUARD, useClass: ApiKeyGuard }],
  exports: [ApiKeyRegistry],
})
export class AuthModule {}
