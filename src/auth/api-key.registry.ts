import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, isRole } from '@/auth/roles';

export interface ApiKeyConfig {
  key: string;
  role: string;
}

/**
 * Resolves an API key to its role. Keys come from the API_KEYS env var
 * (`key1:admin,key2:ingest`), parsed once at startup. An unknown key resolves to
 * undefined, which the guard treats as unauthorized. With no keys configured the
 * registry stays empty and every protected route fails closed.
 */
@Injectable()
export class ApiKeyRegistry {
  private readonly logger = new Logger(ApiKeyRegistry.name);
  private readonly keys = new Map<string, Role>();

  constructor(config: ConfigService) {
    const configured = config.get<ApiKeyConfig[]>('auth.apiKeys', []);
    for (const { key, role } of configured) {
      if (!isRole(role)) {
        this.logger.warn(`Ignoring API key with unknown role "${role}"`);
        continue;
      }
      this.keys.set(key, role);
    }
    if (this.keys.size === 0) {
      this.logger.warn(
        'No API keys configured; all protected routes will reject requests. Set API_KEYS to enable writes.',
      );
    }
  }

  roleFor(key: string): Role | undefined {
    return this.keys.get(key);
  }
}
