import type { SupplierAvailabilityStore } from '../../src/cache/supplier-availability.repository';
import type { SupplierId } from '../../src/domain/supplier';

export class InMemorySupplierAvailabilityStore implements SupplierAvailabilityStore {
  private readonly unavailable = new Set<SupplierId>();

  isAvailable(supplierId: SupplierId): Promise<boolean> {
    return Promise.resolve(!this.unavailable.has(supplierId));
  }

  setAvailable(supplierId: SupplierId, available: boolean): Promise<void> {
    if (available) {
      this.unavailable.delete(supplierId);
    } else {
      this.unavailable.add(supplierId);
    }
    return Promise.resolve();
  }
}
