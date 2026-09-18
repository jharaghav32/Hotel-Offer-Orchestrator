import type { SupplierId } from '../domain/supplier';

export const HOTEL_OFFERS_WORKFLOW = 'hotelOffersWorkflow';

export const FailureType = {
  SupplierRequestFailed: 'SupplierRequestFailed',
  AllSuppliersUnavailable: 'AllSuppliersUnavailable',
} as const;

export interface HotelOffersWorkflowInput {
  city: string;
}

export interface FetchSupplierHotelsInput {
  supplierId: SupplierId;
  city: string;
}

export function hotelOffersWorkflowId(city: string): string {
  return `hotel-offers-${city}`;
}
