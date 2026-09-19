import type {
  CachedHotelOffers,
  HotelCacheEvictor,
  HotelCacheReader,
  HotelCacheWriter,
  PriceRange,
} from '../../src/cache/hotel-cache.repository';

export class InMemoryHotelCache implements HotelCacheReader, HotelCacheWriter, HotelCacheEvictor {
  private readonly entries = new Map<string, CachedHotelOffers>();
  readonly queries: { city: string; range: PriceRange }[] = [];

  save(entry: CachedHotelOffers): Promise<void> {
    this.entries.set(entry.city, structuredClone(entry));
    return Promise.resolve();
  }

  findByPriceRange(city: string, range: PriceRange): Promise<CachedHotelOffers | null> {
    this.queries.push({ city, range });
    const entry = this.entries.get(city);
    if (!entry) {
      return Promise.resolve(null);
    }
    const min = range.min ?? Number.NEGATIVE_INFINITY;
    const max = range.max ?? Number.POSITIVE_INFINITY;
    return Promise.resolve({
      ...entry,
      offers: entry.offers.filter((offer) => offer.price >= min && offer.price <= max),
    });
  }

  evict(city: string): Promise<boolean> {
    return Promise.resolve(this.entries.delete(city));
  }
}
