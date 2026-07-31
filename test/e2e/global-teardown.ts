import { E2eContainers } from './global-setup';

export default async function globalTeardown(): Promise<void> {
  const containers = (globalThis as Record<string, unknown>).__E2E_CONTAINERS__ as
    E2eContainers | undefined;
  if (!containers) {
    return;
  }
  await Promise.all([
    containers.postgres.stop(),
    containers.elasticsearch.stop(),
    containers.redis.stop(),
  ]);
}
