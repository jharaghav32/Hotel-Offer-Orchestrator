import { ApplicationFailure } from '@temporalio/common';
import { MockActivityEnvironment } from '@temporalio/testing';
import { DefaultLogger } from '@temporalio/worker';
import type {
  CachedHotelOffers,
  HotelCacheWriter,
} from '../../../src/cache/hotel-cache.repository';
import type { SupplierHotel } from '../../../src/domain/hotel';
import { SupplierRequestError, type SupplierClient } from '../../../src/suppliers/supplier.client';
import { createHotelOffersActivities } from '../../../src/temporal/activities/hotel-offers.activities';
import { FailureType, type FetchSupplierHotelsInput } from '../../../src/temporal/contracts';

const delhiFromA: FetchSupplierHotelsInput = { supplierId: 'supplierA', city: 'delhi' };
const delhiFromB: FetchSupplierHotelsInput = { supplierId: 'supplierB', city: 'delhi' };

const hotel: SupplierHotel = {
  hotelId: 'a1',
  name: 'Holtin',
  price: 6000,
  city: 'delhi',
  commissionPct: 10,
};

function setup(fetchHotels: SupplierClient['fetchHotels']) {
  const saved: CachedHotelOffers[] = [];
  const hotelCache: HotelCacheWriter = {
    save: (entry) => {
      saved.push(entry);
      return Promise.resolve();
    },
  };
  const activities = createHotelOffersActivities({
    supplierClient: { fetchHotels },
    hotelCache,
    now: () => new Date('2026-09-19T10:00:00.000Z'),
  });
  return {
    activities,
    saved,
    env: new MockActivityEnvironment(undefined, { logger: new DefaultLogger('ERROR') }),
  };
}

describe('hotel offers activities', () => {
  describe('fetchSupplierHotels', () => {
    it('returns the hotels provided by the supplier client', async () => {
      const { activities, env } = setup(() => Promise.resolve([hotel]));

      await expect(env.run(activities.fetchSupplierHotels, delhiFromA)).resolves.toEqual([hotel]);
    });

    it.each([
      [true, false],
      [false, true],
    ])(
      'maps a supplier error (retryable=%s) to an application failure (nonRetryable=%s)',
      async (retryable, nonRetryable) => {
        const { activities, env } = setup(() =>
          Promise.reject(
            new SupplierRequestError(
              'Supplier B responded with HTTP 503',
              'supplierB',
              retryable,
              503,
            ),
          ),
        );

        const failure = await env
          .run(activities.fetchSupplierHotels, delhiFromB)
          .catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(ApplicationFailure);
        expect(failure).toMatchObject({
          type: FailureType.SupplierRequestFailed,
          nonRetryable,
          message: 'Supplier B responded with HTTP 503',
          details: [{ supplierId: 'supplierB', status: 503 }],
        });
      },
    );

    it('rethrows unexpected errors unchanged', async () => {
      const unexpected = new TypeError('boom');
      const { activities, env } = setup(() => Promise.reject(unexpected));

      await expect(env.run(activities.fetchSupplierHotels, delhiFromA)).rejects.toBe(unexpected);
    });
  });

  describe('cacheHotelOffers', () => {
    it('stores the aggregate with the fetch timestamp', async () => {
      const { activities, env, saved } = setup(() => Promise.resolve([]));
      const aggregate = {
        city: 'delhi',
        offers: [{ name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 }],
        suppliers: { supplierA: 'ok', supplierB: 'ok' } as const,
      };

      await env.run(activities.cacheHotelOffers, aggregate);

      expect(saved).toEqual([{ ...aggregate, fetchedAt: '2026-09-19T10:00:00.000Z' }]);
    });
  });
});
