import { Redis } from 'ioredis';
import type { Logger } from '../shared/logger';

export function createRedisClient(url: string, logger: Logger): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
  });

  client.on('ready', () => logger.info('Redis connection ready'));
  client.on('reconnecting', (delayMs: number) => logger.warn({ delayMs }, 'Redis reconnecting'));
  client.on('error', (error: Error) => logger.error({ err: error }, 'Redis connection error'));

  return client;
}
