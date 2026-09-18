import type { SupplierId } from '../domain/supplier';

export const redisKeys = {
  supplierAvailability: (supplierId: SupplierId) => `supplier:${supplierId}:available`,
  hotelPrices: (city: string) => `hotels:${city}:prices`,
  hotelOffers: (city: string) => `hotels:${city}:offers`,
  hotelMeta: (city: string) => `hotels:${city}:meta`,
} as const;
