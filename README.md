# Hotel Offer Orchestrator

A Node.js (TypeScript) service that aggregates hotel offers from two suppliers, keeps the cheapest
offer for every hotel, and serves the result with optional price filtering. The aggregation is
orchestrated by a **Temporal** workflow, results are stored in **Redis**, and price filtering runs
**inside Redis**. The whole stack starts with Docker Compose.

```
GET /api/hotels?city=delhi&minPrice=5000&maxPrice=7000

[
  { "name": "Holtin",  "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison", "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

## Contents

- [Requirements coverage](#requirements-coverage)
- [Architecture](#architecture)
- [Quick start with Docker](#quick-start-with-docker)
- [Local development](#local-development)
- [API reference](#api-reference)
- [Postman collection](#postman-collection)
- [Tests](#tests)
- [Configuration](#configuration)
- [Design decisions](#design-decisions)
- [Project structure](#project-structure)
- [Assumptions and future work](#assumptions-and-future-work)

## Requirements coverage

| Requirement                                              | Where                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Mock `GET /supplierA/hotels` and `GET /supplierB/hotels` | `src/suppliers` – static data with overlapping names in Delhi and Mumbai                  |
| Call both suppliers in parallel with Temporal            | `src/temporal/workflows/hotel-offers.workflow.ts`                                         |
| Deduplicate by name, keep the cheaper offer              | `src/domain/select-best-offers.ts` (pure, deterministic, unit tested)                     |
| `GET /api/hotels?city=`                                  | `src/hotels`                                                                              |
| Save the deduplicated list in Redis                      | `cacheHotelOffers` activity → `src/cache/hotel-cache.repository.ts`                       |
| Price filtering inside Redis                             | Lua script running `ZRANGE … BYSCORE` on a sorted set scored by price                     |
| Docker                                                   | `Dockerfile` (multi-stage, non-root) and `docker-compose.yml` (full stack)                |
| Postman collection                                       | `postman/hotel-offer-orchestrator.postman_collection.json`                                |
| Bonus: `/health` with the health of both suppliers       | `src/health` – suppliers, Redis and Temporal, each with status and latency                |
| Bonus: logging and error handling                        | structured JSON logs (pino) in API, workflow and activities; retry policies; typed errors |

## Architecture

```
                  ┌───────────────────────── docker compose ─────────────────────────┐
                  │                                                                  │
 client ─ :3000 ──┼─► api (Express) ────────── Lua: ZRANGE … BYSCORE ──────► redis   │
                  │    │  /api/hotels  /health                                 ▲     │
                  │    │  /supplierA   /supplierB ◄──────── HTTP ───────┐      │     │
                  │    │                                                │      │     │
                  │    │ start workflow (cache miss)                    │      │     │
                  │    ▼                                                │      │     │
                  │  temporal ◄──── task queue "hotel-offers" ────► worker ─────┘     │
                  │    │                                          fetch A ‖ fetch B  │
                  │    ▼                                          dedupe, MULTI/EXEC │
                  │  postgresql                                                      │
 browser ─ :8080 ─┼─► temporal-ui ──► temporal                                       │
                  └──────────────────────────────────────────────────────────────────┘
```

**Request flow for `GET /api/hotels`**

1. The query is validated and normalised (`" Delhi "` → `delhi`).
2. A Lua script checks Redis for the city and, if present, filters by price with
   `ZRANGE … BYSCORE` and returns the matching offers in one atomic call → `X-Cache: HIT`.
3. On a miss the API executes the `hotelOffersWorkflow` (workflow id `hotel-offers-{city}`).
4. The worker runs both `fetchSupplierHotels` activities in parallel, keeps the cheapest offer per
   hotel name and stores the result in Redis in a single transaction.
5. The API runs the same Lua script, so filtering always happens in Redis → `X-Cache: MISS`.

**Failure handling**

| Situation                       | Behaviour                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| One supplier fails              | Retried 3× with exponential backoff, then excluded; response has `X-Unavailable-Suppliers` |
| Both suppliers fail             | Workflow fails with `AllSuppliersUnavailable` → `502`, nothing is cached                   |
| Supplier returns 4xx / bad data | Not retried (non-retryable failure)                                                        |
| No worker / Temporal down       | `503 SERVICE_UNAVAILABLE` after `TEMPORAL_WORKFLOW_TIMEOUT_SECONDS`                        |
| Redis down                      | `503 SERVICE_UNAVAILABLE`; `/health` reports Redis down                                    |
| Concurrent requests             | Share one running workflow (`USE_EXISTING` conflict policy)                                |

A deeper write-up of entities, Redis keys, the Lua script, retry policies and error mapping is in
[docs/DESIGN.md](docs/DESIGN.md).

## Quick start with Docker

**Prerequisites:** Docker with Compose v2.

```bash
git clone <repository-url> hotel-offer-orchestrator
cd hotel-offer-orchestrator
docker compose up -d --build --wait
```

The first start takes about 1–2 minutes (image build and Temporal schema setup). When the command
returns, every service is healthy.

| URL                                         | What                                 |
| ------------------------------------------- | ------------------------------------ |
| http://localhost:3000/api/hotels?city=delhi | Aggregated hotel offers              |
| http://localhost:3000/health                | Health of suppliers, Redis, Temporal |
| http://localhost:8080                       | Temporal Web UI (workflow history)   |

```bash
curl -i "http://localhost:3000/api/hotels?city=delhi"
curl -i "http://localhost:3000/api/hotels?city=delhi&minPrice=5000&maxPrice=7000"
curl -s  "http://localhost:3000/health"
```

Useful commands:

```bash
docker compose logs -f api worker          # structured JSON logs
docker compose up -d --scale worker=3      # scale workers horizontally
docker compose down                        # stop (keeps Temporal history)
docker compose down -v                     # stop and delete all data
```

If ports 3000 or 8080 are taken, override them: `API_PORT=3001 TEMPORAL_UI_PORT=8081 docker compose up -d --wait`.

### Services

| Service       | Image                          | Role                                                |
| ------------- | ------------------------------ | --------------------------------------------------- |
| `api`         | built from `Dockerfile`        | Express API, mock suppliers, health                 |
| `worker`      | built from `Dockerfile`        | Temporal worker running the workflow and activities |
| `temporal`    | `temporalio/auto-setup:1.29.1` | Temporal server (creates schema and namespace)      |
| `postgresql`  | `postgres:16-alpine`           | Temporal persistence                                |
| `temporal-ui` | `temporalio/ui:2.42.1`         | Web UI                                              |
| `redis`       | `redis:8-alpine`               | Cache of deduplicated offers                        |

## Local development

**Prerequisites:** Node.js 22.12+ (the repo pins 26 in `.nvmrc`), Yarn 1, Docker.

```bash
nvm use
yarn install
cp .env.example .env

docker run -d --name hoo-temporal -p 7233:7233 -p 8233:8233 temporalio/temporal server start-dev --ip 0.0.0.0
docker run -d --name hoo-redis -p 6379:6379 redis:8-alpine

yarn dev:api       # terminal 1 – API on :3000, reloads on change
yarn dev:worker    # terminal 2 – Temporal worker
```

The Temporal dev server includes its UI at http://localhost:8233.

| Script                  | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `yarn dev:api`          | API with hot reload                        |
| `yarn dev:worker`       | Worker with hot reload                     |
| `yarn build`            | Compile to `dist/`                         |
| `yarn start:api`        | Run compiled API                           |
| `yarn start:worker`     | Run compiled worker                        |
| `yarn test`             | All tests                                  |
| `yarn test:unit`        | Unit tests only                            |
| `yarn test:integration` | HTTP, Temporal and Redis integration tests |
| `yarn typecheck`        | TypeScript check                           |
| `yarn lint`             | ESLint                                     |
| `yarn format`           | Prettier                                   |

## API reference

All errors share one shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "city: city is required", "details": [ … ] } }
```

Every response carries `X-Request-Id` (echoed from the request when provided); the same id appears in
the logs.

### `GET /api/hotels`

| Query      | Required | Rules                                                                      |
| ---------- | -------- | -------------------------------------------------------------------------- |
| `city`     | yes      | letters, single spaces or hyphens, max 50; case and spacing are normalised |
| `minPrice` | no       | non-negative number, inclusive                                             |
| `maxPrice` | no       | non-negative number, inclusive, `≥ minPrice`                               |

**200** – array of `{ name, price, supplier, commissionPct }`, one per hotel, sorted by price.

| Response header           | Meaning                                                  |
| ------------------------- | -------------------------------------------------------- |
| `X-Cache: HIT \| MISS`    | Served from Redis, or aggregated by a fresh workflow run |
| `X-Unavailable-Suppliers` | Suppliers that failed; the list is partial               |

| Status | Code                        | When                                      |
| ------ | --------------------------- | ----------------------------------------- |
| 400    | `VALIDATION_ERROR`          | Invalid query                             |
| 502    | `ALL_SUPPLIERS_UNAVAILABLE` | No supplier answered                      |
| 503    | `SERVICE_UNAVAILABLE`       | Temporal or Redis unavailable, or timeout |

A city no supplier serves returns `200 []`.

### Mock suppliers

`GET /supplierA/hotels?city=delhi` and `GET /supplierB/hotels?city=delhi` return the supplier format:

```json
[{ "hotelId": "a1", "name": "Holtin", "price": 6000, "city": "delhi", "commissionPct": 10 }]
```

`city` is optional. Data covers `delhi` and `mumbai` (both suppliers, overlapping names),
`bangalore` (Supplier A only) and `goa` (Supplier B only). A disabled supplier answers
`503 SUPPLIER_UNAVAILABLE`.

### Health

| Endpoint           | Response                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`      | `{ status, timestamp, checks: { supplierA, supplierB, redis, temporal } }`, each check with `status` and `latencyMs` (and `error` when down) |
| `GET /health/live` | `{ "status": "ok" }` – process liveness, used by the container healthcheck                                                                   |

| Overall    | When                                                  | HTTP |
| ---------- | ----------------------------------------------------- | ---- |
| `ok`       | everything up                                         | 200  |
| `degraded` | a supplier is down (partial results are still served) | 200  |
| `down`     | Redis or Temporal down, or every supplier down        | 503  |

### Admin (testing and operations)

These endpoints are not part of the brief; they make failure scenarios reproducible.

| Endpoint                             | Body                     | Effect                                          |
| ------------------------------------ | ------------------------ | ----------------------------------------------- |
| `GET /admin/suppliers`               | –                        | Availability of each mock supplier              |
| `PATCH /admin/suppliers/:supplierId` | `{ "available": false }` | Simulate a supplier outage (`true` restores it) |
| `DELETE /admin/cache/:city`          | –                        | Evict a city so the next request re-aggregates  |

```bash
curl -X PATCH localhost:3000/admin/suppliers/supplierB -H 'content-type: application/json' -d '{"available":false}'
curl -X DELETE localhost:3000/admin/cache/mumbai
curl -i "localhost:3000/api/hotels?city=mumbai"      # Supplier A only, X-Unavailable-Suppliers: supplierB
```

## Postman collection

`postman/hotel-offer-orchestrator.postman_collection.json` – 44 requests with 165 assertions:

| Folder                               | Covers                                                        |
| ------------------------------------ | ------------------------------------------------------------- |
| 0. Setup                             | Re-enables suppliers and evicts cities so runs are repeatable |
| 1. Health                            | `/health`, `/health/live`                                     |
| 2. Mock suppliers                    | Supplier formats and overlapping names                        |
| 3. Hotels – valid city with overlaps | Deduplication, cheapest offer per hotel, cache miss/hit       |
| 4. Hotels – price filter             | Range, min only, max only, inclusive bounds, empty range      |
| 5. Hotels – city with no results     | `city=paris` → `[]`                                           |
| 6. Simulate one supplier down        | Retries, partial result, `degraded` health, recovery          |
| 7. Simulate all suppliers down       | `502`, `down` health, recovery                                |
| 8. Validation and errors             | 400 and 404 responses                                         |

**Postman:** Import → select the file → run the collection with the Collection Runner. Change the
`baseUrl` collection variable if the API is not on `http://localhost:3000`.

**Command line** (with the stack running):

```bash
docker run --rm --network host -v "$PWD/postman:/etc/newman" postman/newman:6-alpine \
  run hotel-offer-orchestrator.postman_collection.json --env-var baseUrl=http://localhost:3000
```

## Tests

```bash
yarn test                                            # everything that needs no external service
REDIS_TEST_URL=redis://localhost:6379/15 yarn test   # also runs the Redis repository tests
```

| Suite                        | What it covers                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Unit                         | dedupe rules, validation, services, activities, error mapping, health, shutdown                         |
| HTTP integration (supertest) | every route, status codes, headers and error bodies                                                     |
| Temporal integration         | the real workflow on Temporal's local test server: parallel fetch, partial failure, all failed, retries |
| Redis integration            | sorted set layout, TTLs, Lua filtering with inclusive bounds, eviction                                  |

The Temporal integration tests download Temporal's test server on first run. The Redis tests run
when `REDIS_TEST_URL` is set and use the given database (it is flushed between tests).

## Configuration

Environment variables are validated at startup; the process exits with a list of problems if any
value is invalid. Defaults suit local development; `docker-compose.yml` sets the container values.

| Variable                            | Default                  | Purpose                                 |
| ----------------------------------- | ------------------------ | --------------------------------------- |
| `PORT`                              | `3000`                   | API port                                |
| `LOG_LEVEL`                         | `info`                   | `fatal` … `trace`, `silent`             |
| `REDIS_URL`                         | `redis://localhost:6379` | Redis connection                        |
| `TEMPORAL_ADDRESS`                  | `localhost:7233`         | Temporal frontend                       |
| `TEMPORAL_NAMESPACE`                | `default`                | Temporal namespace                      |
| `TEMPORAL_TASK_QUEUE`               | `hotel-offers`           | Task queue shared by API and worker     |
| `TEMPORAL_WORKFLOW_TIMEOUT_SECONDS` | `30`                     | Upper bound for one aggregation         |
| `SUPPLIER_BASE_URL`                 | `http://localhost:3000`  | Where the worker reaches the suppliers  |
| `SUPPLIER_TIMEOUT_MS`               | `3000`                   | HTTP timeout per supplier call          |
| `CACHE_TTL_SECONDS`                 | `300`                    | Lifetime of a complete result           |
| `PARTIAL_CACHE_TTL_SECONDS`         | `30`                     | Lifetime of a result missing a supplier |
| `HEALTH_CHECK_TIMEOUT_MS`           | `2000`                   | Timeout of each health check            |
| `SHUTDOWN_TIMEOUT_MS`               | `10000`                  | Grace period for in-flight requests     |

## Design decisions

- **Deduplication** – hotels are matched by name ignoring case and extra whitespace. The lowest price
  wins; ties go to the higher `commissionPct`, then to supplier order, so results are deterministic.
  The logic is a pure function used inside the workflow, which keeps workflow replays deterministic.
- **Redis layout** – per city, a sorted set `hotels:{city}:prices` (member = hotel, score = price) is
  the price index, a hash `hotels:{city}:offers` holds the offer JSON, and `hotels:{city}:meta` records
  when and how the city was fetched (it also marks cities with no hotels as cached). Writes use one
  `MULTI/EXEC`; reads use one Lua script, so a reader never sees a half-written or half-expired city.
- **Freshness** – complete results live `CACHE_TTL_SECONDS`; results missing a supplier live only
  `PARTIAL_CACHE_TTL_SECONDS`, so a recovered supplier is picked up quickly.
- **Temporal** – activities do all I/O; the workflow only orchestrates. Supplier calls: 5 s timeout,
  3 attempts with exponential backoff; 5xx, timeouts and network errors are retried, 4xx and invalid
  payloads are not. The workflow id is derived from the city with the `USE_EXISTING` conflict policy,
  so concurrent requests for the same city share one run.
- **Contract safety** – supplier responses are validated with zod before use; environment variables
  and request input are validated with zod as well.
- **Layering** – feature modules (`suppliers`, `hotels`, `health`) with routes → controller → service →
  repository/client. Services depend on interfaces, so tests replace Redis and Temporal with in-memory
  fakes.
- **Operations** – JSON logs with request ids, `/health` vs `/health/live`, graceful shutdown that
  drains in-flight requests, multi-stage non-root image, health-gated Compose start order.

## Project structure

```
src/
├── config/        environment validation
├── domain/        entities and pure logic (selectBestOffers, normalisation)
├── suppliers/     mock supplier API, static data, HTTP client used by the worker
├── hotels/        GET /api/hotels and cache eviction
├── health/        /health and /health/live
├── cache/         Redis client, key builders, repositories (MULTI/EXEC write, Lua read)
├── temporal/      workflow, activities, client, worker entry point
├── api/           shared middleware (request logging, errors) and validation
├── shared/        logger, errors, timeouts, graceful shutdown
├── app.ts         Express composition
└── server.ts      API entry point
tests/             unit and integration tests, shared fakes in tests/support
postman/           Postman collection
docs/DESIGN.md     detailed design
```

## Assumptions and future work

- Hotels are identified by name within a city, as the brief specifies; a real system would match on a
  stable property id or geo data.
- Prices are compared as given, in a single currency.
- The mock suppliers live inside the API service as the brief asks; the worker reaches them over HTTP
  exactly as it would reach external suppliers.
- `temporalio/auto-setup` is Temporal's self-configuring image for local use and is published up to
  1.29. Production would run `temporalio/server` with schema migrations or Temporal Cloud.

Possible next steps: a Temporal Schedule to refresh popular cities in the background, supplier
webhooks for cache invalidation, a circuit breaker per supplier, pagination for large cities, and
metrics (Prometheus) alongside the logs.
