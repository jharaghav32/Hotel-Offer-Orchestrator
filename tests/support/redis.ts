import { Redis } from 'ioredis';

export const redisTestUrl = process.env.REDIS_TEST_URL;

export const describeWithRedis = redisTestUrl ? describe : describe.skip;

export function createTestRedis(): Redis {
  if (!redisTestUrl) {
    throw new Error('REDIS_TEST_URL is not set');
  }
  return new Redis(redisTestUrl, { maxRetriesPerRequest: 1 });
}
