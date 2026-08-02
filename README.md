# Advanced Product Search API

A NestJS API for advanced product search built around Elasticsearch relevance, Redis backed autocomplete and a Postgres source of truth. The codebase follows a hexagonal architecture so the domain and application layers stay free of any framework or vendor detail.

## Table of contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Quick start with Docker](#quick-start-with-docker)
5. [Local development](#local-development)
6. [Configuration](#configuration)
7. [API reference](#api-reference)
8. [Testing](#testing)
9. [Design notes](#design-notes)
10. [Known tradeoffs and next steps](#known-tradeoffs-and-next-steps)

## Features

* Full text search over name, description, category, subcategories, location and price.
* Relevance ranking. Name matches weigh highest, with a gentle popularity boost blended into the score.
* Geo search: filter by a radius around a coordinate and sort by distance, alongside the plain city filter.
* Autocomplete served from Elasticsearch and cached in Redis, with typo tolerance so `laptp` still completes to laptops.
* Query suggestions (did you mean) powered by a phrase suggester, collated against the index so every suggestion is guaranteed to return results.
* Combined and individual faceting for categories, subcategories, location and price.
* Filtering by category, subcategories, location, price range and geo radius.
* Highlighting of the matched terms in name and description.
* Pagination and sorting by relevance, popularity, creation date or distance.
* Typo tolerance through fuzzy matching, so labtop still finds laptops.
* Full product lifecycle: create, update, delete and a view event that feeds a live popularity signal.
* Zero downtime reindexing: rebuilds stream into a staging index and an atomic alias swap makes them visible.
* Transactional outbox: every write records an entry that a background processor replays, so the search projection converges even through an Elasticsearch outage.
* Structured JSON logging with request correlation ids, rate limiting, graceful shutdown and readiness aware health checks.
* Environment driven configuration validated at startup and global error handling with precise status codes.
* Unit tests plus an end to end suite that runs the real stack through Testcontainers, wired into CI.

## Architecture

The `products` module is split into three layers. Dependencies always point inward, toward the domain.

```mermaid
flowchart LR
  Client([HTTP client]) --> Controller

  subgraph Infrastructure
    Controller[ProductsController]
    ESAdapter[EsProductSearchAdapter]
    RedisAdapter[RedisCacheAdapter]
    PrismaRepo[PrismaProductRepository]
  end

  subgraph Application
    UC["Use cases<br/>Search · Autocomplete · Create · Reindex"]
  end

  subgraph Domain
    P1[[ProductSearchIndex]]
    P2[[CachePort]]
    P3[[ProductRepository]]
  end

  Controller --> UC
  UC --> P1
  UC --> P2
  UC --> P3

  ESAdapter -. implements .-> P1
  RedisAdapter -. implements .-> P2
  PrismaRepo -. implements .-> P3

  ESAdapter --> ES[(Elasticsearch)]
  RedisAdapter --> Redis[(Redis)]
  PrismaRepo --> PG[(Postgres)]
```

The use cases depend on the ports (the boxed interfaces). The adapters implement those ports, so the arrows of implementation point inward toward the domain: that is the dependency inversion that keeps the core independent of Elasticsearch, Redis and Prisma. The folder layout mirrors it:

```
src/products/
  domain/                      core, no framework or vendor imports
    product.ts                 Product aggregate
    ports/                     ProductRepository, ProductSearchIndex, CachePort (interfaces)
    search/                    SearchCriteria and SearchResult value objects
  application/
    use-cases/                 SearchProducts, Autocomplete, CreateProduct, ReindexProducts
  infrastructure/              adapters that implement the domain ports
    http/                      controllers, DTOs, mappers
    persistence/prisma/        Postgres repository via Prisma
    search/                    Elasticsearch adapter and query builder
    cache/                     Redis adapter
```

The domain defines ports (interfaces) and the infrastructure provides adapters. Use cases depend only on the ports, never on Prisma or the Elasticsearch client, which keeps the core testable in isolation and the technology choices replaceable.

Postgres is the write model and single source of truth. Elasticsearch is a denormalized read projection of it. When a product is created the write use case saves it to Postgres and then indexes it into Elasticsearch. A `search:reindex` command rebuilds the whole index from Postgres on demand.

### Path aliases

Imports use the `@/` alias mapped to `src/` (for example `@/products/domain/product`). It resolves in every context: the Nest build and jest handle it natively, and the production build rewrites the alias to relative paths with `tsc-alias` so the compiled output in `dist/` runs under plain Node with no runtime loader.

## Tech stack

| Concern            | Choice                          |
| ------------------ | ------------------------------- |
| Framework          | NestJS 11                       |
| Language           | TypeScript                      |
| Search engine      | Elasticsearch 8                 |
| Cache and suggest  | Redis 7                         |
| Source of truth    | PostgreSQL 16                   |
| ORM                | Prisma                          |
| Validation         | class validator, Joi for env    |
| API docs           | Swagger (OpenAPI)               |
| Logging            | pino via nestjs pino            |
| Rate limiting      | NestJS throttler                |
| Health checks      | NestJS terminus                 |
| Tests              | Jest, Supertest, Testcontainers |
| CI                 | GitHub Actions                  |

## Quick start with Docker

Requirements: Docker and Docker Compose.

```bash
docker compose up --build
```

That command brings up Postgres, Elasticsearch, Redis and the API. On startup the API container syncs the database schema, seeds sample products (skipped if the table is already populated) and reindexes Elasticsearch from Postgres before it starts listening. The reindex is idempotent: it runs only when the index is out of sync with Postgres, so restarting the container does not tear down a healthy index.

Once the stack is healthy:

* API base URL: `http://localhost:3000/api`
* Swagger docs: `http://localhost:3000/api/docs`
* Health check: `http://localhost:3000/api/health`

Try a request:

```bash
curl "http://localhost:3000/api/products/search?q=laptop&sort=relevance"
```

To change the amount of seed data set `SEED_PRODUCT_COUNT` in `docker-compose.yml` before bringing the stack up. It defaults to 500 products.

To stop and remove the stack together with its volumes:

```bash
docker compose down -v
```

### Hardened stack

The base stack leaves authentication off so a reviewer can bring it up with zero friction. A production like overlay turns security on across every service (Postgres and Redis passwords, Elasticsearch basic auth):

```bash
docker compose -f docker-compose.yml -f docker-compose.hardened.yml up --build
```

The overlay reads its passwords from the environment with weak demo defaults, so set real values (`POSTGRES_PASSWORD`, `ELASTIC_PASSWORD`, `REDIS_PASSWORD`) before using it for anything beyond a local trial. The application picks the credentials up through `ELASTICSEARCH_USERNAME` / `ELASTICSEARCH_PASSWORD` and `REDIS_PASSWORD`, which stay unset for the open stack.

### Upgrading an existing volume

A plain `docker compose up --build` migrates an already populated stack in place: `db push` adds the new nullable coordinate columns, the seed backfills coordinates for existing rows, and the boot reindex rebuilds the versioned index (`products_v2`) with the new mapping. `docker compose down -v` remains the clean slate path.

## Local development

You can run the API on the host while the infrastructure runs in Docker.

```bash
# 1. Start only the backing services
docker compose up -d postgres elasticsearch redis

# 2. Install dependencies and generate the Prisma client
npm install
npm run prisma:generate

# 3. Copy the environment file (the defaults already target localhost)
cp .env.example .env

# 4. Prepare the database and the index
npm run bootstrap        # db push, seed, reindex

# 5. Run the API in watch mode
npm run start:dev
```

Useful scripts:

| Script                    | Purpose                                         |
| ------------------------- | ----------------------------------------------- |
| `npm run start:dev`       | Run the API in watch mode                       |
| `npm run build`           | Compile to `dist/` (tsc plus tsc-alias)         |
| `npm run db:push`         | Sync the Prisma schema to Postgres              |
| `npm run db:seed`         | Seed sample products with faker                 |
| `npm run search:reindex`  | Force a full rebuild of the Elasticsearch index |
| `npm run bootstrap`       | Run db:push, db:seed and search:reindex in order|
| `npm test`                | Run the unit test suite                         |
| `npm run test:e2e`        | Run the end to end suite (needs Docker)         |
| `npm run test:cov`        | Run tests with coverage, enforced thresholds    |
| `npm run lint`            | Lint and autofix                                |
| `npm run lint:check`      | Lint without fixing (used by CI)                |

## Configuration

Configuration comes from environment variables, validated at startup with Joi. The application refuses to boot on an invalid configuration.

| Variable                       | Default                          | Description                                  |
| ------------------------------ | -------------------------------- | -------------------------------------------- |
| `NODE_ENV`                     | `development`                    | Runtime environment                          |
| `PORT`                         | `3000`                           | HTTP port                                    |
| `API_PREFIX`                   | `api`                            | Global route prefix                          |
| `LOG_LEVEL`                    | `info`                           | pino log level                               |
| `THROTTLE_TTL_MS`              | `60000`                          | Rate limit window in milliseconds            |
| `THROTTLE_LIMIT`               | `120`                            | Requests allowed per window and client       |
| `THROTTLE_KEY_PREFIX`          | `` (empty)                       | Namespaces throttle counters in a shared Redis|
| `THROTTLE_FAIL_OPEN`           | `true`                           | Allow (true) or refuse (false) when Redis is down|
| `THROTTLE_AUTOCOMPLETE_TTL_MS` | `10000`                          | Autocomplete rate limit window               |
| `THROTTLE_AUTOCOMPLETE_LIMIT`  | `30`                             | Autocomplete requests per window and client  |
| `OUTBOX_POLL_MS`               | `5000`                           | Interval of the outbox processor             |
| `DATABASE_URL`                 | see `.env.example`               | Postgres connection string                   |
| `ELASTICSEARCH_NODE`           | `http://localhost:9200`          | Elasticsearch endpoint                       |
| `ELASTICSEARCH_PRODUCT_INDEX`  | `products`                       | Index name                                   |
| `ELASTICSEARCH_USERNAME`       | unset                            | Basic auth user (set when security is on)    |
| `ELASTICSEARCH_PASSWORD`       | unset                            | Basic auth password                          |
| `REDIS_HOST`                   | `localhost`                      | Redis host                                   |
| `REDIS_PORT`                   | `6379`                           | Redis port                                   |
| `REDIS_PASSWORD`               | unset                            | Redis password (set when requirepass is on)  |
| `REDIS_TTL_SECONDS`            | `60`                             | Default cache time to live                   |
| `SEARCH_MAX_PAGE_SIZE`         | `100`                            | Upper bound for the page size                |
| `AUTOCOMPLETE_MAX_SUGGESTIONS` | `10`                             | Upper bound for autocomplete results         |
| `API_KEYS`                     | `` (empty)                       | Comma separated `key:role` pairs granting write access, e.g. `k1:admin,k2:ingest`. Empty means no writes are allowed |
| `CORS_ORIGINS`                 | `` (empty)                       | Comma separated allowed origins. Empty grants no cross-origin access in production (permissive in development) |
| `SWAGGER_ENABLED`              | `true`                           | Serve Swagger at `/api/docs`. Set to `false` in production |
| `SEED_PRODUCT_COUNT`           | `500`                            | Number of products created by the seed       |

## API reference

Base URL: `http://localhost:3000/api`. Interactive documentation lives at `/api/docs`.

### Authentication

Reads (`search`, `autocomplete`, `health`) are public. Writes (`POST`, `PUT`,
`DELETE /products`), the view endpoint and `GET /metrics` require an API key
passed as `Authorization: Bearer <key>` (or `X-API-Key: <key>`). Keys and their
roles are configured with `API_KEYS` (see [Configuration](#configuration)):
`admin` may mutate products and scrape metrics; `ingest` may only record views.
A missing or unknown key is `401`; a valid key without the required role is `403`.

### GET /products/search

Advanced search with relevance ranking, faceting, filtering, pagination, sorting and suggestions.

Query parameters:

| Parameter       | Type              | Description                                                        |
| --------------- | ----------------- | ----------------------------------------------------------------- |
| `q`             | string            | Free text query                                                   |
| `categories`    | string list       | Filter by category. Comma separated or repeated key               |
| `subcategories` | string list       | Filter by subcategory                                             |
| `locations`     | string list       | Filter by location                                                |
| `minPrice`      | number            | Lower price bound                                                 |
| `maxPrice`      | number            | Upper price bound                                                 |
| `lat`           | number            | Latitude of the search origin. Requires `lon`                     |
| `lon`           | number            | Longitude of the search origin. Requires `lat`                    |
| `radiusKm`      | number            | Only match products within this radius. Requires `lat` and `lon`  |
| `sort`          | enum              | `relevance`, `popularity`, `created_at` or `distance`. Defaults to relevance. `distance` requires `lat` and `lon` |
| `order`         | enum              | `asc` or `desc`. Defaults to desc, except `distance` which defaults to nearest first |
| `page`          | integer           | One based page number for offset pagination. Defaults to 1        |
| `pageSize`      | integer           | Page size, capped by `SEARCH_MAX_PAGE_SIZE`. Defaults to 20       |
| `cursor`        | string            | Opaque token from a previous `meta.nextCursor`, for deep pagination past the offset window. Cannot be combined with `page` |

Every response carries a `meta.nextCursor` token (null on the last page). Pass it back as `cursor` to page arbitrarily deep with `search_after`, past the 10000 result ceiling that offset pagination is capped at.

Geo example:

```bash
curl "http://localhost:3000/api/products/search?lat=40.4168&lon=-3.7038&radiusKm=25&sort=distance"
```

Example:

```bash
curl "http://localhost:3000/api/products/search?q=phone&categories=Electronics&minPrice=100&maxPrice=800&sort=popularity&order=desc&page=1&pageSize=10"
```

Response shape:

```json
{
  "data": [
    {
      "id": "…",
      "name": "Aurora Phone",
      "description": "…",
      "category": "Electronics",
      "subcategories": ["Smartphones"],
      "location": "Madrid",
      "coordinates": { "lat": 40.4321, "lon": -3.6852 },
      "price": 699.99,
      "popularity": 340,
      "createdAt": "2026-01-10T12:00:00.000Z",
      "score": 12.4,
      "highlights": { "name": "Aurora <em>Phone</em>" },
      "distanceKm": 3.21
    }
  ],
  "meta": { "total": 128, "page": 1, "pageSize": 10, "totalPages": 13 },
  "facets": {
    "categories": [{ "value": "Electronics", "count": 128 }],
    "subcategories": [{ "value": "Smartphones", "count": 64 }],
    "locations": [{ "value": "Madrid", "count": 30 }],
    "price": { "min": 100, "max": 799.99, "avg": 420.55 }
  },
  "suggestions": ["phones"]
}
```

`highlights` appears only for text queries when the engine produced fragments, and `distanceKm` only when sorting by distance.

Error semantics: a malformed request (inconsistent geo parameters, pagination beyond the first 10000 results, a query the engine rejects) returns `400` with a message explaining the problem. A search backend outage returns `503`. Client mistakes are never reported as outages.

### GET /products/autocomplete

Prefix suggestions for product names, served from Elasticsearch and cached in Redis. Exact prefixes rank first and a fuzzy clause rescues typos, so `laptp` still suggests laptops. This route has a stricter rate limit because it fires on every keystroke.

| Parameter | Type    | Description                                              |
| --------- | ------- | ------------------------------------------------------- |
| `q`       | string  | Prefix to complete                                      |
| `limit`   | integer | Maximum suggestions, capped by `AUTOCOMPLETE_MAX_SUGGESTIONS` |

```bash
curl "http://localhost:3000/api/products/autocomplete?q=lap&limit=5"
```

```json
{ "suggestions": ["Laptop", "Laptop stand", "Aurora Laptop Pro"] }
```

### POST /products

Creates a product in Postgres and projects it into Elasticsearch in the same use case, so it is immediately searchable. The write also bumps the cache generation, which instantly invalidates every cached search page. Coordinates are optional and must come as a pair. Requires an `admin` API key. Popularity is server-owned and always starts at `0`; it is not accepted from the client.

```bash
curl -X POST "http://localhost:3000/api/products" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-key>" \
  -d '{
    "name": "Aurora Laptop Pro",
    "description": "A lightweight laptop for everyday use",
    "category": "Electronics",
    "subcategories": ["Laptops"],
    "location": "Madrid",
    "latitude": 40.4168,
    "longitude": -3.7038,
    "price": 1299.99
  }'
```

### PUT /products/:id

Full replacement of a product. The identity, creation date and accumulated popularity are all kept; popularity only ever moves through the view endpoint. The change is searchable on the next request. Requires an `admin` API key. Returns `404` for an unknown id.

### DELETE /products/:id

Removes the product from Postgres and from the search index. Requires an `admin` API key. Returns `204` on success and `404` for an unknown id.

### POST /products/:id/view

Records a view: atomically increments the popularity in Postgres and reprojects the document, so relevance boosting and popularity sorting reflect real interactions. Requires an `admin` or `ingest` API key. Returns the new popularity.

```bash
curl -X POST "http://localhost:3000/api/products/<id>/view" \
  -H "Authorization: Bearer <ingest-key>"
```

```json
{ "id": "…", "popularity": 341 }
```

### GET /health

Readiness check. Pings Postgres, Elasticsearch and Redis through terminus and returns `503` with a per dependency breakdown when any of them is down, so an orchestrator stops routing traffic to a degraded instance.

### GET /health/liveness

Liveness check. Only proves the process responds, with no dependency checks, so a cache outage never causes a restart loop.

### Postman

A ready to use collection lives at `postman/advanced-search.postman_collection.json`. Import it into Postman. The `baseUrl` variable defaults to `http://localhost:3000/api`.

## Testing

**Unit tests** cover the pure logic where most of the behaviour lives: the Elasticsearch query builder (relevance shaping, combined faceting, geo clauses, filters, sorting, highlighting and suggestions), the HTTP to domain criteria mapper (including the geo consistency rules and the deep pagination guard), the caching behaviour of the use cases, the adapter error mapping, the Product aggregate invariants, the health indicators and the pagination helpers. They run fast and need no infrastructure.

```bash
npm test
npm run test:cov     # with coverage
```

**End to end tests** boot the real application (with the production middleware pipeline) against ephemeral Postgres, Elasticsearch and Redis containers managed by Testcontainers, and drive it over HTTP with Supertest. They verify relevance ordering, faceting, highlighting, typo tolerance, collated suggestions, geo radius filtering, distance sorting, cache invalidation on writes, validation errors, rate limiting and the readiness vs liveness split.

```bash
npm run test:e2e
```

They need a running Docker daemon (Docker Desktop on Windows and macOS). The first run downloads the service images, so allow a few extra minutes.

## Design notes

**Combined faceting.** Active filters are applied through `post_filter` so they narrow the hits without shrinking the top level aggregations. Each facet aggregation then reapplies every other active filter but not its own, so selecting one category still shows the sibling categories while the location and price facets already reflect that choice. This is the behaviour a faceted search UI expects.

**Relevance.** The text query is a `multi_match` with field boosts (name highest, then category and subcategories, then description) and `AUTO` fuzziness for typo tolerance. When sorting by relevance a `function_score` adds a gentle popularity factor on top of the text score rather than letting popularity dominate. When sorting by an explicit field that score shaping is skipped.

**Geo search.** Products carry an optional `geo_point`. A radius query becomes a `geo_distance` filter that also constrains every facet, and distance sorting uses `_geo_distance` with the per hit distance surfaced as `distanceKm`. Coordinates are nullable in Postgres so the schema upgrade works in place, and documents without coordinates simply sort last.

**Autocomplete typo tolerance.** The `search_as_you_type` query stays a `bool_prefix` `multi_match`, boosted so exact prefixes always win, with a separate fuzzy `match` clause as a rescue path. The clauses are separate because fuzziness inside a `bool_prefix` `multi_match` never applies to the final prefix term and behaves poorly on the shingle subfields.

**Suggestions that always work.** The phrase suggester runs with `confidence` 1.0, so a reasonable query is not corrected into noise, and a `collate` query checks every candidate against the index so a suggestion the user clicks always has results.

**Zero downtime reindexing.** Reads go through a stable alias while every rebuild streams into a fresh physical index named `{alias}_v{schema}_{timestamp}`. When the rebuild finishes, one atomic alias action makes the new generation visible and the old physicals are cleaned up; a failed rebuild is simply discarded, leaving the live index untouched. The schema version embedded in the physical name lets the boot reindex detect a mapping change and rebuild automatically, with no entrypoint changes and no manual steps.

**Transactional outbox.** Every product mutation writes an outbox entry in the same Postgres transaction. The request path still indexes synchronously (so writes are searchable on the next request), and a background processor replays pending entries against the index, which turns an Elasticsearch outage at write time into a short delay instead of silent drift. Replaying an already projected write is an idempotent upsert.

**Live popularity.** `POST /products/:id/view` atomically increments the popularity that the `function_score` blends into relevance and that `sort=popularity` ranks by. View events deliberately do not flush the search cache: a ranking nudge does not justify invalidating every cached page, and the short TTL bounds the staleness.

**Caching.** Search pages are cached in Redis under `search:v{schema}:g{generation}:{sha1(criteria)}`. Hashing keeps keys short and stable regardless of filter order, the schema version fences off stale shapes after a deploy, and the generation counter is bumped by every write, which instantly invalidates all cached pages without scanning Redis. Old entries simply expire through their TTL. Autocomplete uses the same scheme. Cached dates are rehydrated into real Date objects on read. Every cache operation degrades gracefully, so a Redis outage slows the API down instead of taking it down.

**Errors with the right status.** The Elasticsearch adapter distinguishes a rejected request (a 400 class response, surfaced as `InvalidSearchQueryError` and mapped to HTTP 400) from connectivity failures and server errors (`SearchUnavailableError`, HTTP 503). The deep pagination guard rejects requests beyond the `max_result_window` up front with a clear message.

**Observability and protection.** All logs are structured JSON through pino, each request carries a correlation id (honouring an inbound `x-request-id`), sensitive headers are redacted and health probes are excluded from access logs. A global throttler bounds request rates per client with a stricter budget for autocomplete; its counters live in Redis, so the limits hold across replicas, and a fail open wrapper lets requests through if Redis is unreachable instead of turning every call into an error. Shutdown hooks close Postgres and Redis connections cleanly on SIGTERM.

**Data model.** Postgres holds the write model and is the single source of truth. Elasticsearch is a read projection. Keeping the two responsibilities separate lets each side use the tool it is good at, and the reindex command can always rebuild the index from Postgres.

**Prisma 7.** Persistence uses Prisma 7 with the pg driver adapter. The client talks to Postgres through the `pg` driver instead of a bundled query engine, so there is no native engine binary to match against the container architecture. The connection URL lives in `prisma.config.ts` and is read from `DATABASE_URL`, shared by both the CLI (`db push`) and the application.

**Error handling.** A global exception filter turns any error into a consistent JSON envelope, and validation runs through a global pipe that rejects unknown fields.

## Design decisions

Each of these is a deliberate choice, spelled out so the reasoning is explicit rather than implicit. Where a choice is configurable, the knob is named.

* **Write path consistency.** Writes hit Postgres first (with a transactional outbox entry) and then index synchronously for immediate searchability, with the outbox processor as the convergence guarantee. The per request `refresh: wait_for` buys read your writes semantics at the cost of a little write latency, which is the right default for a catalogue where an editor expects to see their change immediately; a write heavy pipeline that can tolerate a short delay would drop it and let the outbox converge asynchronously.

* **Reindex convergence.** The bootstrap reindex is idempotent and self healing: it rebuilds only when the schema version changed, the document count differs from Postgres, or a content checksum stamped on the index no longer matches the data (so out of band edits that leave the count unchanged are detected and repaired without a manual command). Rebuilds are invisible thanks to the alias swap, and a write racing a reindex in another process is reprojected into the new generation by the outbox within one poll interval.

* **Deep pagination.** Page based access uses `from` and `size` and is capped at the first 10000 results, the point past which offset paging degrades inside the engine. Beyond that the API returns a `meta.nextCursor` token on every response and accepts it as `cursor`, switching to `search_after` with a unique tiebreaker so a client can page through the entire result set at constant cost with no skips or repeats.

* **Popularity signal.** Views feed popularity live through the view endpoint, and the checksum that guards the reindex deliberately excludes it so the frequent view traffic never forces a rebuild. Richer signals (clicks, purchases, decay over time) and batched increments would be the natural extension for a production ranking pipeline.

* **Rate limiting failure mode.** Throttle counters are shared through Redis so limits hold across replicas. When Redis is unreachable the guard fails open by default, favouring availability over protection, and `THROTTLE_FAIL_OPEN=false` flips it to fail closed (a clean 503) for an API that would rather shed load than serve unmetered.

* **Infrastructure hardening.** The base Docker stack runs with authentication off for a friction free local evaluation. The `docker-compose.hardened.yml` overlay turns security on across every service (Postgres and Redis passwords, Elasticsearch basic auth), and the application picks the credentials up through dedicated environment variables, so the same image runs against either stack.

* **Dependency hygiene.** `npm audit` reports zero vulnerabilities. The project runs on NestJS 11, and a scoped `overrides` entry pins the one transitive package (`js-yaml` under Swagger) whose upstream release still lagged.
