import type { SupplierHotel } from '../domain/hotel';
import { normalizeCity } from '../domain/normalize';
import type { SupplierId } from '../domain/supplier';
import { deepFreeze } from '../shared/immutable';
import { supplierAHotels } from './data/supplier-a.hotels';
import { supplierBHotels } from './data/supplier-b.hotels';

export interface SupplierCatalog {
  listHotels(supplierId: SupplierId, city?: string): readonly SupplierHotel[];
}

export class StaticSupplierCatalog implements SupplierCatalog {
  private readonly inventory: Readonly<Record<SupplierId, readonly SupplierHotel[]>>;

  constructor(
    inventory: Record<SupplierId, readonly SupplierHotel[]> = {
      supplierA: supplierAHotels,
      supplierB: supplierBHotels,
    },
  ) {
    this.inventory = deepFreeze(structuredClone(inventory));
  }

  listHotels(supplierId: SupplierId, city?: string): readonly SupplierHotel[] {
    const hotels = this.inventory[supplierId];
    if (city === undefined) {
      return hotels;
    }
    const target = normalizeCity(city);
    return hotels.filter((hotel) => normalizeCity(hotel.city) === target);
  }
}
