/**
 * Route level throttle settings for the @Throttle decorator. Decorator
 * metadata is evaluated at import time, before Nest dependency injection
 * exists, so these values must come straight from the environment instead of
 * ConfigService. The defaults mirror env.validation.ts.
 */
export const AUTOCOMPLETE_THROTTLE = {
  limit: parseInt(process.env.THROTTLE_AUTOCOMPLETE_LIMIT ?? '30', 10),
  ttl: parseInt(process.env.THROTTLE_AUTOCOMPLETE_TTL_MS ?? '10000', 10),
};
