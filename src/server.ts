import { createApp } from './app';
import { RedisHotelCache } from './cache/hotel-cache.repository';
import { createRedisClient } from './cache/redis.client';
import { RedisSupplierAvailabilityStore } from './cache/supplier-availability.repository';
import { config } from './config/env';
import { SUPPLIER_IDS } from './domain/supplier';
import { redisCheck, supplierCheck, temporalCheck } from './health/health.checks';
import { HealthService } from './health/health.service';
import { HotelService } from './hotels/hotel.service';
import { createGracefulShutdown, onShutdownSignals } from './shared/graceful-shutdown';
import { logger } from './shared/logger';
import { MockSupplierService } from './suppliers/mock-supplier.service';
import { StaticSupplierCatalog } from './suppliers/supplier.catalog';
import { HttpSupplierClient } from './suppliers/supplier.client';
import { createTemporalClient, HotelOffersWorkflowClient } from './temporal/client';

const redis = createRedisClient(config.redis.url, logger);
const temporal = createTemporalClient(config.temporal);
const supplierProbe = new HttpSupplierClient({
  baseUrl: config.suppliers.baseUrl,
  timeoutMs: config.health.timeoutMs,
});

const supplierService = new MockSupplierService(
  new StaticSupplierCatalog(),
  new RedisSupplierAvailabilityStore(redis),
  logger,
);

const hotelService = new HotelService(
  new RedisHotelCache(redis, config.cache),
  new HotelOffersWorkflowClient(temporal.client, config.temporal),
  logger,
);

const healthService = new HealthService(
  [
    ...SUPPLIER_IDS.map((supplierId) => supplierCheck(supplierId, supplierProbe)),
    redisCheck(redis),
    temporalCheck(temporal.connection, config.health.timeoutMs),
  ],
  { timeoutMs: config.health.timeoutMs },
);

const app = createApp({ logger, supplierService, hotelService, healthService });

const server = app.listen(config.http.port, () => {
  logger.info({ port: config.http.port, env: config.env }, 'API server listening');
});

server.on('error', (error) => {
  logger.fatal({ err: error }, 'API server failed to start');
  process.exit(1);
});

onShutdownSignals(
  createGracefulShutdown({
    server,
    logger,
    timeoutMs: config.shutdown.timeoutMs,
    resources: [
      { name: 'temporal', close: () => temporal.connection.close() },
      { name: 'redis', close: () => redis.quit() },
    ],
  }),
);
