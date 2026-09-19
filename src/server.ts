import { createApp } from './app';
import { RedisHotelCache } from './cache/hotel-cache.repository';
import { createRedisClient } from './cache/redis.client';
import { RedisSupplierAvailabilityStore } from './cache/supplier-availability.repository';
import { config } from './config/env';
import { HotelService } from './hotels/hotel.service';
import { logger } from './shared/logger';
import { MockSupplierService } from './suppliers/mock-supplier.service';
import { StaticSupplierCatalog } from './suppliers/supplier.catalog';
import { createTemporalClient, HotelOffersWorkflowClient } from './temporal/client';

const redis = createRedisClient(config.redis.url, logger);
const temporal = createTemporalClient(config.temporal);

const supplierService = new MockSupplierService(
  new StaticSupplierCatalog(),
  new RedisSupplierAvailabilityStore(redis),
);

const hotelService = new HotelService(
  new RedisHotelCache(redis, config.cache),
  new HotelOffersWorkflowClient(temporal, config.temporal),
  logger,
);

const app = createApp({ logger, supplierService, hotelService });

const server = app.listen(config.http.port, () => {
  logger.info({ port: config.http.port, env: config.env }, 'API server listening');
});

server.on('error', (error) => {
  logger.fatal({ err: error }, 'API server failed to start');
  process.exit(1);
});
