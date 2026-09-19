import type { HotelCacheReader } from '../cache/hotel-cache.repository';
import type { HotelOffer } from '../domain/hotel';
import { SUPPLIER_IDS, type SupplierId } from '../domain/supplier';
import { ServiceUnavailableError } from '../shared/errors';
import type { Logger } from '../shared/logger';
import type { HotelOffersWorkflowRunner } from '../temporal/client';
import type { HotelSearchQuery } from './hotel.query';

export type CacheStatus = 'HIT' | 'MISS';

export interface HotelSearchResult {
  offers: HotelOffer[];
  cache: CacheStatus;
  unavailableSuppliers: SupplierId[];
}

export class HotelService {
  constructor(
    private readonly cache: HotelCacheReader,
    private readonly workflows: HotelOffersWorkflowRunner,
    private readonly logger: Logger,
  ) {}

  async search({ city, minPrice, maxPrice }: HotelSearchQuery): Promise<HotelSearchResult> {
    const range = { min: minPrice, max: maxPrice };

    const cached = await this.cache.findByPriceRange(city, range);
    if (cached) {
      this.logger.debug({ city, range }, 'Hotel offers served from cache');
      return this.toResult(cached, 'HIT');
    }

    this.logger.info({ city }, 'Hotel offers not cached, starting aggregation workflow');
    await this.workflows.run(city);

    const fresh = await this.cache.findByPriceRange(city, range);
    if (!fresh) {
      throw new ServiceUnavailableError('Hotel offers are not available in the cache');
    }
    return this.toResult(fresh, 'MISS');
  }

  private toResult(
    { offers, suppliers }: { offers: HotelOffer[]; suppliers: Record<SupplierId, string> },
    cache: CacheStatus,
  ): HotelSearchResult {
    return {
      offers,
      cache,
      unavailableSuppliers: SUPPLIER_IDS.filter((supplierId) => suppliers[supplierId] !== 'ok'),
    };
  }
}
