import { ApplicationFailure, activityInfo, log } from '@temporalio/activity';
import type { HotelCacheWriter } from '../../cache/hotel-cache.repository';
import type { AggregatedHotelOffers, SupplierHotel } from '../../domain/hotel';
import { SupplierRequestError, type SupplierClient } from '../../suppliers/supplier.client';
import { FailureType, type FetchSupplierHotelsInput } from '../contracts';

export interface HotelOffersActivityDependencies {
  supplierClient: SupplierClient;
  hotelCache: HotelCacheWriter;
  now?: () => Date;
}

export function createHotelOffersActivities({
  supplierClient,
  hotelCache,
  now = () => new Date(),
}: HotelOffersActivityDependencies) {
  return {
    fetchSupplierHotels: async ({
      supplierId,
      city,
    }: FetchSupplierHotelsInput): Promise<SupplierHotel[]> => {
      const { attempt } = activityInfo();

      try {
        const hotels = await supplierClient.fetchHotels(supplierId, city);
        log.info('Supplier hotels fetched', { supplierId, city, attempt, count: hotels.length });
        return hotels;
      } catch (error) {
        if (!(error instanceof SupplierRequestError)) {
          throw error;
        }
        log.warn('Supplier request failed', {
          supplierId,
          city,
          attempt,
          status: error.status,
          retryable: error.retryable,
          reason: error.message,
        });
        throw ApplicationFailure.create({
          message: error.message,
          type: FailureType.SupplierRequestFailed,
          nonRetryable: !error.retryable,
          details: [{ supplierId, status: error.status ?? null }],
        });
      }
    },

    cacheHotelOffers: async (aggregate: AggregatedHotelOffers): Promise<void> => {
      await hotelCache.save({ ...aggregate, fetchedAt: now().toISOString() });
      log.info('Hotel offers cached', { city: aggregate.city, count: aggregate.offers.length });
    },
  };
}

export type HotelOffersActivities = ReturnType<typeof createHotelOffersActivities>;
