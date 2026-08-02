import { SetMetadata } from '@nestjs/common';
import { Role } from '@/auth/roles';

export const ROLES_KEY = 'roles';

/**
 * Marks a route (or whole controller) as protected: the caller must present an
 * API key whose role is one of the listed ones. Routes without @Roles stay
 * public, so the guard is opt-in and read/health endpoints need no changes.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
