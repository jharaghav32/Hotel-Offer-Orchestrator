import { HotelService } from '../../../src/hotels/hotel.service';
import { AllSuppliersUnavailableError } from '../../../src/shared/errors';
import { FakeWorkflowRunner } from '../../support/fake-workflow-runner';
import { InMemoryHotelCache } from '../../support/in-memory-hotel-cache';
import { silentLogger } from '../../support/silent-logger';
import { delhiAggregate } from '../../support/test-app';

describe('HotelService', () => {
  let cache: InMemoryHotelCache;
  let workflows: FakeWorkflowRunner;
  let service: HotelService;

  beforeEach(() => {
    cache = new InMemoryHotelCache();
    workflows = new FakeWorkflowRunner(cache, () => Promise.resolve(delhiAggregate));
    service = new HotelService(cache, workflows, silentLogger);
  });

  it('runs the workflow on a cache miss and reads the filtered result back from the cache', async () => {
    const result = await service.search({ city: 'delhi', minPrice: 5000, maxPrice: 7000 });

    expect(workflows.runs).toEqual(['delhi']);
    expect(result).toEqual({
      cache: 'MISS',
      unavailableSuppliers: [],
      offers: [
        { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
        { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
      ],
    });
    expect(cache.queries.map((query) => query.range)).toEqual([
      { min: 5000, max: 7000 },
      { min: 5000, max: 7000 },
    ]);
  });

  it('serves a cache hit without running the workflow', async () => {
    await service.search({ city: 'delhi' });

    const result = await service.search({ city: 'delhi', maxPrice: 4000 });

    expect(workflows.runs).toEqual(['delhi']);
    expect(result.cache).toBe('HIT');
    expect(result.offers.map((offer) => offer.name)).toEqual(['Lemon Tree']);
  });

  it('reports suppliers that failed during aggregation', async () => {
    workflows.respondWith(() =>
      Promise.resolve({ ...delhiAggregate, suppliers: { supplierA: 'ok', supplierB: 'failed' } }),
    );

    const result = await service.search({ city: 'delhi' });

    expect(result.unavailableSuppliers).toEqual(['supplierB']);
  });

  it('propagates workflow failures', async () => {
    const failure = new AllSuppliersUnavailableError('All suppliers are unavailable');
    workflows.respondWith(() => Promise.reject(failure));

    await expect(service.search({ city: 'goa' })).rejects.toBe(failure);
  });

  it('evicts a city so the next search runs the workflow again', async () => {
    await service.search({ city: 'delhi' });

    await expect(service.evict('delhi')).resolves.toBe(true);
    await expect(service.evict('delhi')).resolves.toBe(false);
    const result = await service.search({ city: 'delhi' });

    expect(result.cache).toBe('MISS');
    expect(workflows.runs).toEqual(['delhi', 'delhi']);
  });
});
