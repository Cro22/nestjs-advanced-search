import { ConfigService } from '@nestjs/config';
import { ApiKeyRegistry } from '@/auth/api-key.registry';

function registryWith(apiKeys: { key: string; role: string }[]): ApiKeyRegistry {
  const config = {
    get: (_key: string, fallback: unknown) => apiKeys ?? fallback,
  } as unknown as ConfigService;
  return new ApiKeyRegistry(config);
}

describe('ApiKeyRegistry', () => {
  it('resolves a configured key to its role', () => {
    const registry = registryWith([
      { key: 'k1', role: 'admin' },
      { key: 'k2', role: 'ingest' },
    ]);

    expect(registry.roleFor('k1')).toBe('admin');
    expect(registry.roleFor('k2')).toBe('ingest');
  });

  it('returns undefined for an unknown key', () => {
    const registry = registryWith([{ key: 'k1', role: 'admin' }]);

    expect(registry.roleFor('nope')).toBeUndefined();
  });

  it('ignores keys whose role is not recognised', () => {
    const registry = registryWith([{ key: 'k1', role: 'superuser' }]);

    expect(registry.roleFor('k1')).toBeUndefined();
  });

  it('resolves nothing when no keys are configured', () => {
    const registry = registryWith([]);

    expect(registry.roleFor('anything')).toBeUndefined();
  });
});
