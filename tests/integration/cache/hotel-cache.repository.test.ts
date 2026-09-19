import type { Redis } from 'ioredis';
import { RedisHotelCache } from '../../../src/cache/hotel-cache.repository';
import type { HotelOffer } from '../../../src/domain/hotel';
import { createTestRedis, describeWithRedis } from '../../support/redis';

const offers: HotelOffer[] = [
  { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
  { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
  { name: 'Oberoi', price: 8000, supplier: 'Supplier B', commissionPct: 15 },
];

describeWithRedis('RedisHotelCache', () => {
  let redis: Redis;
  let cache: RedisHotelCache;

  beforeAll(() => {
    redis = createTestRedis();
    cache = new RedisHotelCache(redis, { ttlSeconds: 300, partialTtlSeconds: 30 });
  });

  beforeEach(() => redis.flushdb());

  afterAll(() => redis.quit());

  it('stores prices in a sorted set, offers in a hash and metadata, all with a ttl', async () => {
    await cache.save({
      city: 'delhi',
      offers,
      suppliers: { supplierA: 'ok', supplierB: 'ok' },
      fetchedAt: '2026-09-19T10:00:00.000Z',
    });

    await expect(redis.zrange('hotels:delhi:prices', '0', '-1', 'WITHSCORES')).resolves.toEqual([
      'Holtin',
      '5340',
      'Radison',
      '5900',
      'Oberoi',
      '8000',
    ]);
    await expect(redis.hget('hotels:delhi:offers', 'Radison')).resolves.toBe(
      JSON.stringify(offers[1]),
    );
    await expect(redis.hgetall('hotels:delhi:meta')).resolves.toEqual({
      fetchedAt: '2026-09-19T10:00:00.000Z',
      count: '3',
      supplierA: 'ok',
      supplierB: 'ok',
    });

    for (const key of ['hotels:delhi:prices', 'hotels:delhi:offers', 'hotels:delhi:meta']) {
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    }
  });

  it('replaces previous entries so removed hotels do not linger', async () => {
    const base = {
      city: 'delhi',
      suppliers: { supplierA: 'ok', supplierB: 'ok' } as const,
      fetchedAt: 'x',
    };

    await cache.save({ ...base, offers });
    await cache.save({ ...base, offers: [offers[0]!] });

    await expect(redis.zrange('hotels:delhi:prices', '0', '-1')).resolves.toEqual(['Holtin']);
    await expect(redis.hkeys('hotels:delhi:offers')).resolves.toEqual(['Holtin']);
  });

  it('records an empty result with metadata only', async () => {
    await cache.save({
      city: 'paris',
      offers: [],
      suppliers: { supplierA: 'ok', supplierB: 'failed' },
      fetchedAt: 'x',
    });

    await expect(redis.exists('hotels:paris:prices', 'hotels:paris:offers')).resolves.toBe(0);
    await expect(redis.hgetall('hotels:paris:meta')).resolves.toMatchObject({
      count: '0',
      supplierB: 'failed',
    });
  });

  it('uses the shorter ttl when a supplier failed', async () => {
    await cache.save({
      city: 'mumbai',
      offers,
      suppliers: { supplierA: 'ok', supplierB: 'failed' },
      fetchedAt: 'x',
    });

    for (const key of ['hotels:mumbai:prices', 'hotels:mumbai:offers', 'hotels:mumbai:meta']) {
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);
    }
  });

  describe('findByPriceRange', () => {
    const names = (result: { offers: HotelOffer[] } | null) =>
      result?.offers.map((offer) => offer.name);

    beforeEach(() =>
      cache.save({
        city: 'delhi',
        offers,
        suppliers: { supplierA: 'ok', supplierB: 'failed' },
        fetchedAt: '2026-09-19T10:00:00.000Z',
      }),
    );

    it('returns null when the city has not been cached', async () => {
      await expect(cache.findByPriceRange('goa', {})).resolves.toBeNull();
    });

    it('returns every offer sorted by price with metadata when no range is given', async () => {
      await expect(cache.findByPriceRange('delhi', {})).resolves.toEqual({
        city: 'delhi',
        offers,
        suppliers: { supplierA: 'ok', supplierB: 'failed' },
        fetchedAt: '2026-09-19T10:00:00.000Z',
      });
    });

    it.each([
      [{ min: 5000, max: 7000 }, ['Holtin', 'Radison']],
      [{ min: 5340, max: 5900 }, ['Holtin', 'Radison']],
      [{ min: 5341, max: 5899 }, []],
      [{ min: 5900 }, ['Radison', 'Oberoi']],
      [{ max: 5900 }, ['Holtin', 'Radison']],
      [{ min: 9000 }, []],
    ])('filters inside redis for range %j (inclusive bounds)', async (range, expected) => {
      expect(names(await cache.findByPriceRange('delhi', range))).toEqual(expected);
    });

    it('returns an empty list for a cached city without hotels', async () => {
      await cache.save({
        city: 'paris',
        offers: [],
        suppliers: { supplierA: 'ok', supplierB: 'ok' },
        fetchedAt: 'x',
      });

      await expect(cache.findByPriceRange('paris', {})).resolves.toMatchObject({ offers: [] });
    });

    it('treats an expired city as a cache miss', async () => {
      await redis.del('hotels:delhi:meta');

      await expect(cache.findByPriceRange('delhi', {})).resolves.toBeNull();
    });
  });

  it('evicts every key of a city and reports whether anything was removed', async () => {
    await cache.save({
      city: 'delhi',
      offers,
      suppliers: { supplierA: 'ok', supplierB: 'ok' },
      fetchedAt: 'x',
    });

    await expect(cache.evict('delhi')).resolves.toBe(true);
    await expect(
      redis.exists('hotels:delhi:meta', 'hotels:delhi:prices', 'hotels:delhi:offers'),
    ).resolves.toBe(0);
    await expect(cache.evict('delhi')).resolves.toBe(false);
  });
});
