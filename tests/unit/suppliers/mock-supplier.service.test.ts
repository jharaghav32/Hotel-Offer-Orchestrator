import { ServiceUnavailableError, SupplierUnavailableError } from '../../../src/shared/errors';
import { MockSupplierService } from '../../../src/suppliers/mock-supplier.service';
import { StaticSupplierCatalog } from '../../../src/suppliers/supplier.catalog';
import { InMemorySupplierAvailabilityStore } from '../../support/in-memory-supplier-availability.store';
import { silentLogger } from '../../support/silent-logger';

describe('MockSupplierService', () => {
  let service: MockSupplierService;

  beforeEach(() => {
    service = new MockSupplierService(
      new StaticSupplierCatalog(),
      new InMemorySupplierAvailabilityStore(),
      silentLogger,
    );
  });

  it('lists hotels of an available supplier', async () => {
    const hotels = await service.listHotels('supplierA', 'delhi');

    expect(hotels.length).toBeGreaterThan(0);
  });

  it('rejects requests to a disabled supplier', async () => {
    await service.setAvailability('supplierB', false);

    await expect(service.listHotels('supplierB', 'delhi')).rejects.toBeInstanceOf(
      SupplierUnavailableError,
    );
    await expect(service.listHotels('supplierA', 'delhi')).resolves.not.toHaveLength(0);
  });

  it('reports availability for every supplier', async () => {
    await service.setAvailability('supplierA', false);

    await expect(service.listAvailability()).resolves.toEqual([
      { supplierId: 'supplierA', name: 'Supplier A', available: false },
      { supplierId: 'supplierB', name: 'Supplier B', available: true },
    ]);
  });

  describe('when the availability store is unreachable', () => {
    const unreachable = new ServiceUnavailableError('Supplier availability store is unavailable');
    const brokenService = new MockSupplierService(
      new StaticSupplierCatalog(),
      {
        isAvailable: () => Promise.reject(unreachable),
        setAvailable: () => Promise.reject(unreachable),
      },
      silentLogger,
    );

    it('keeps serving hotels', async () => {
      await expect(brokenService.listHotels('supplierA', 'delhi')).resolves.not.toHaveLength(0);
    });

    it('surfaces the outage to availability queries and updates', async () => {
      await expect(brokenService.listAvailability()).rejects.toBe(unreachable);
      await expect(brokenService.setAvailability('supplierA', false)).rejects.toBe(unreachable);
    });
  });
});
