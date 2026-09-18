import type { SupplierAvailabilityStore } from '../cache/supplier-availability.repository';
import type { SupplierHotel } from '../domain/hotel';
import { SUPPLIER_IDS, SUPPLIER_NAMES, type SupplierId } from '../domain/supplier';
import { SupplierUnavailableError } from '../shared/errors';
import type { SupplierCatalog } from './supplier.catalog';

export interface SupplierAvailability {
  supplierId: SupplierId;
  name: string;
  available: boolean;
}

export class MockSupplierService {
  constructor(
    private readonly catalog: SupplierCatalog,
    private readonly availability: SupplierAvailabilityStore,
  ) {}

  async listHotels(supplierId: SupplierId, city?: string): Promise<readonly SupplierHotel[]> {
    if (!(await this.availability.isAvailable(supplierId))) {
      throw new SupplierUnavailableError(`${SUPPLIER_NAMES[supplierId]} is currently unavailable`);
    }
    return this.catalog.listHotels(supplierId, city);
  }

  async getAvailability(supplierId: SupplierId): Promise<SupplierAvailability> {
    return {
      supplierId,
      name: SUPPLIER_NAMES[supplierId],
      available: await this.availability.isAvailable(supplierId),
    };
  }

  listAvailability(): Promise<SupplierAvailability[]> {
    return Promise.all(SUPPLIER_IDS.map((supplierId) => this.getAvailability(supplierId)));
  }

  async setAvailability(supplierId: SupplierId, available: boolean): Promise<SupplierAvailability> {
    await this.availability.setAvailable(supplierId, available);
    return { supplierId, name: SUPPLIER_NAMES[supplierId], available };
  }
}
