import * as Joi from 'joi';

/**
 * Fail fast at boot if the environment is misconfigured rather than surfacing
 * cryptic connection errors later.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),

  THROTTLE_TTL_MS: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(120),
  THROTTLE_KEY_PREFIX: Joi.string().allow('').default(''),
  THROTTLE_FAIL_OPEN: Joi.boolean().default(true),
  THROTTLE_AUTOCOMPLETE_TTL_MS: Joi.number().default(10000),
  THROTTLE_AUTOCOMPLETE_LIMIT: Joi.number().default(30),

  OUTBOX_POLL_MS: Joi.number().default(5000),

  DATABASE_URL: Joi.string().required(),

  ELASTICSEARCH_NODE: Joi.string().uri().required(),
  ELASTICSEARCH_PRODUCT_INDEX: Joi.string().default('products'),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_TTL_SECONDS: Joi.number().default(60),

  SEARCH_MAX_PAGE_SIZE: Joi.number().default(100),
  AUTOCOMPLETE_MAX_SUGGESTIONS: Joi.number().default(10),
});
