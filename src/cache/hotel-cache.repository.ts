import type { Redis } from 'ioredis';
import type { AggregatedHotelOffers } from '../domain/hotel';
import { redisKeys } from './keys';

export interface CachedHotelOffers extends AggregatedHotelOffers {
  fetchedAt: string;
}

export interface HotelCacheWriter {
  save(entry: CachedHotelOffers): Promise<void>;
}

export class HotelCacheWriteError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HotelCacheWriteError';
  }
}

export class RedisHotelCache implements HotelCacheWriter {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  async save({ city, offers, suppliers, fetchedAt }: CachedHotelOffers): Promise<void> {
    const pricesKey = redisKeys.hotelPrices(city);
    const offersKey = redisKeys.hotelOffers(city);
    const metaKey = redisKeys.hotelMeta(city);

    const transaction = this.redis.multi().del(pricesKey, offersKey, metaKey);

    if (offers.length > 0) {
      transaction
        .zadd(pricesKey, ...offers.flatMap((offer) => [offer.price, offer.name]))
        .hset(
          offersKey,
          Object.fromEntries(offers.map((offer) => [offer.name, JSON.stringify(offer)])),
        )
        .expire(pricesKey, this.ttlSeconds)
        .expire(offersKey, this.ttlSeconds);
    }

    transaction
      .hset(metaKey, { fetchedAt, count: String(offers.length), ...suppliers })
      .expire(metaKey, this.ttlSeconds);

    const results = await transaction.exec();
    const failure = results?.find(([error]) => error !== null)?.[0];

    if (results === null || failure) {
      throw new HotelCacheWriteError(`Failed to cache hotel offers for '${city}'`, {
        cause: failure ?? undefined,
      });
    }
  }
}
