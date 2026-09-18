import type { SupplierId } from './supplier';

export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

export interface HotelOffer {
  name: string;
  price: number;
  supplier: string;
  commissionPct: number;
}

export interface SupplierHotelList {
  supplierId: SupplierId;
  hotels: readonly SupplierHotel[];
}
