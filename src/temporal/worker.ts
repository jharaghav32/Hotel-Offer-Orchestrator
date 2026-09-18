import { NativeConnection, Runtime, Worker } from '@temporalio/worker';
import { RedisHotelCache } from '../cache/hotel-cache.repository';
import { createRedisClient } from '../cache/redis.client';
import { config } from '../config/env';
import { logger } from '../shared/logger';
import { HttpSupplierClient } from '../suppliers/supplier.client';
import { createHotelOffersActivities } from './activities/hotel-offers.activities';
import { PinoTemporalLogger } from './logger';

async function main(): Promise<void> {
  Runtime.install({ logger: new PinoTemporalLogger(logger.child({ component: 'temporal' })) });

  const redis = createRedisClient(config.redis.url, logger);
  const connection = await NativeConnection.connect({ address: config.temporal.address });

  try {
    const worker = await Worker.create({
      connection,
      namespace: config.temporal.namespace,
      taskQueue: config.temporal.taskQueue,
      workflowsPath: require.resolve('./workflows'),
      activities: createHotelOffersActivities({
        supplierClient: new HttpSupplierClient(config.suppliers),
        hotelCache: new RedisHotelCache(redis, config.cache.ttlSeconds),
      }),
    });

    logger.info(
      { taskQueue: config.temporal.taskQueue, address: config.temporal.address },
      'Temporal worker started',
    );
    await worker.run();
  } finally {
    await connection.close();
    await redis.quit();
  }
}

main().then(
  () => logger.info('Temporal worker stopped'),
  (error: unknown) => {
    logger.fatal({ err: error }, 'Temporal worker failed');
    process.exitCode = 1;
  },
);
