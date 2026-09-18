import { createApp } from './app';
import { createRedisClient } from './cache/redis.client';
import { RedisSupplierAvailabilityStore } from './cache/supplier-availability.repository';
import { config } from './config/env';
import { logger } from './shared/logger';
import { MockSupplierService } from './suppliers/mock-supplier.service';
import { StaticSupplierCatalog } from './suppliers/supplier.catalog';

const redis = createRedisClient(config.redis.url, logger);

const supplierService = new MockSupplierService(
  new StaticSupplierCatalog(),
  new RedisSupplierAvailabilityStore(redis),
);

const app = createApp({ logger, supplierService });

const server = app.listen(config.http.port, () => {
  logger.info({ port: config.http.port, env: config.env }, 'API server listening');
});

server.on('error', (error) => {
  logger.fatal({ err: error }, 'API server failed to start');
  process.exit(1);
});
