import { ApplicationFailure, log, proxyActivities } from '@temporalio/workflow';
import type { AggregatedHotelOffers, SupplierHotelList, SupplierOutcome } from '../../domain/hotel';
import { selectBestOffers } from '../../domain/select-best-offers';
import { SUPPLIER_IDS, type SupplierId } from '../../domain/supplier';
import type { HotelOffersActivities } from '../activities/hotel-offers.activities';
import { FailureType, type HotelOffersWorkflowInput } from '../contracts';

const { fetchSupplierHotels } = proxyActivities<HotelOffersActivities>({
  startToCloseTimeout: '5 seconds',
  retry: {
    maximumAttempts: 3,
    initialInterval: '500 milliseconds',
    backoffCoefficient: 2,
    maximumInterval: '2 seconds',
  },
});

const { cacheHotelOffers } = proxyActivities<HotelOffersActivities>({
  startToCloseTimeout: '5 seconds',
  retry: {
    maximumAttempts: 5,
    initialInterval: '200 milliseconds',
    backoffCoefficient: 2,
  },
});

interface SupplierResult {
  supplierId: SupplierId;
  list: SupplierHotelList | null;
}

function failureReason(error: unknown): string {
  if (error instanceof Error) {
    return error.cause instanceof Error ? error.cause.message : error.message;
  }
  return String(error);
}

async function fetchFromSupplier(supplierId: SupplierId, city: string): Promise<SupplierResult> {
  try {
    const hotels = await fetchSupplierHotels({ supplierId, city });
    return { supplierId, list: { supplierId, hotels } };
  } catch (error) {
    log.warn('Supplier excluded from aggregation', {
      supplierId,
      city,
      reason: failureReason(error),
    });
    return { supplierId, list: null };
  }
}

export async function hotelOffersWorkflow({
  city,
}: HotelOffersWorkflowInput): Promise<AggregatedHotelOffers> {
  const results = await Promise.all(
    SUPPLIER_IDS.map((supplierId) => fetchFromSupplier(supplierId, city)),
  );

  const lists = results.flatMap(({ list }) => (list ? [list] : []));
  const suppliers = Object.fromEntries(
    results.map(({ supplierId, list }) => [supplierId, list ? 'ok' : 'failed']),
  ) as Record<SupplierId, SupplierOutcome>;

  if (lists.length === 0) {
    throw ApplicationFailure.nonRetryable(
      'All suppliers are unavailable',
      FailureType.AllSuppliersUnavailable,
      { city, suppliers },
    );
  }

  const aggregate: AggregatedHotelOffers = { city, offers: selectBestOffers(lists), suppliers };
  await cacheHotelOffers(aggregate);

  log.info('Hotel offers aggregated', { city, count: aggregate.offers.length, suppliers });
  return aggregate;
}
