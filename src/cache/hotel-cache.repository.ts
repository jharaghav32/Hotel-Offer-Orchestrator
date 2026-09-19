import type { Redis } from 'ioredis';
import type { AggregatedHotelOffers, HotelOffer, SupplierOutcome } from '../domain/hotel';
import { SUPPLIER_IDS, type SupplierId } from '../domain/supplier';
import { ServiceUnavailableError } from '../shared/errors';
import { redisKeys } from './keys';

export interface CachedHotelOffers extends AggregatedHotelOffers {
  fetchedAt: string;
}

export interface PriceRange {
  min?: number | undefined;
  max?: number | undefined;
}

export interface HotelCacheWriter {
  save(entry: CachedHotelOffers): Promise<void>;
}

export interface HotelCacheReader {
  findByPriceRange(city: string, range: PriceRange): Promise<CachedHotelOffers | null>;
}

export interface HotelCacheEvictor {
  evict(city: string): Promise<boolean>;
}

export interface HotelCacheTtl {
  ttlSeconds: number;
  partialTtlSeconds: number;
}

export class HotelCacheWriteError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HotelCacheWriteError';
  }
}

const FIND_BY_PRICE_RANGE_SCRIPT = `
local meta = redis.call('HGETALL', KEYS[1])
if #meta == 0 then
  return false
end
local names = redis.call('ZRANGE', KEYS[2], ARGV[1], ARGV[2], 'BYSCORE')
local offers = {}
for index, name in ipairs(names) do
  offers[index] = redis.call('HGET', KEYS[3], name)
end
return { meta, offers }
`;

type ScriptReply = [string[], (string | null)[]] | null;

function toPairs(flat: string[]): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (let index = 0; index + 1 < flat.length; index += 2) {
    pairs[flat[index]!] = flat[index + 1]!;
  }
  return pairs;
}

function toOutcomes(meta: Record<string, string>): Record<SupplierId, SupplierOutcome> {
  return Object.fromEntries(
    SUPPLIER_IDS.map((supplierId) => [supplierId, meta[supplierId] === 'ok' ? 'ok' : 'failed']),
  ) as Record<SupplierId, SupplierOutcome>;
}

export class RedisHotelCache implements HotelCacheWriter, HotelCacheReader, HotelCacheEvictor {
  constructor(
    private readonly redis: Redis,
    private readonly ttl: HotelCacheTtl,
  ) {}

  async save({ city, offers, suppliers, fetchedAt }: CachedHotelOffers): Promise<void> {
    const pricesKey = redisKeys.hotelPrices(city);
    const offersKey = redisKeys.hotelOffers(city);
    const metaKey = redisKeys.hotelMeta(city);
    const complete = Object.values(suppliers).every((outcome) => outcome === 'ok');
    const ttlSeconds = complete ? this.ttl.ttlSeconds : this.ttl.partialTtlSeconds;

    const transaction = this.redis.multi().del(pricesKey, offersKey, metaKey);

    if (offers.length > 0) {
      transaction
        .zadd(pricesKey, ...offers.flatMap((offer) => [offer.price, offer.name]))
        .hset(
          offersKey,
          Object.fromEntries(offers.map((offer) => [offer.name, JSON.stringify(offer)])),
        )
        .expire(pricesKey, ttlSeconds)
        .expire(offersKey, ttlSeconds);
    }

    transaction
      .hset(metaKey, { fetchedAt, count: String(offers.length), ...suppliers })
      .expire(metaKey, ttlSeconds);

    const results = await transaction.exec();
    const failure = results?.find(([error]) => error !== null)?.[0];

    if (results === null || failure) {
      throw new HotelCacheWriteError(`Failed to cache hotel offers for '${city}'`, {
        cause: failure ?? undefined,
      });
    }
  }

  async findByPriceRange(
    city: string,
    { min, max }: PriceRange,
  ): Promise<CachedHotelOffers | null> {
    let reply: ScriptReply;
    try {
      reply = (await this.redis.eval(
        FIND_BY_PRICE_RANGE_SCRIPT,
        3,
        redisKeys.hotelMeta(city),
        redisKeys.hotelPrices(city),
        redisKeys.hotelOffers(city),
        min ?? '-inf',
        max ?? '+inf',
      )) as ScriptReply;
    } catch (error) {
      throw new ServiceUnavailableError('Hotel cache is unavailable', undefined, { cause: error });
    }

    if (reply === null) {
      return null;
    }

    const [flatMeta, rawOffers] = reply;
    const meta = toPairs(flatMeta);
    const offers = rawOffers.flatMap((raw) =>
      raw === null ? [] : [JSON.parse(raw) as HotelOffer],
    );

    return {
      city,
      offers,
      suppliers: toOutcomes(meta),
      fetchedAt: meta.fetchedAt ?? '',
    };
  }

  async evict(city: string): Promise<boolean> {
    try {
      const removed = await this.redis.del(
        redisKeys.hotelMeta(city),
        redisKeys.hotelPrices(city),
        redisKeys.hotelOffers(city),
      );
      return removed > 0;
    } catch (error) {
      throw new ServiceUnavailableError('Hotel cache is unavailable', undefined, { cause: error });
    }
  }
}
