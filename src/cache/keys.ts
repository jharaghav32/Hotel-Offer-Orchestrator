import type { SupplierId } from '../domain/supplier';

export const redisKeys = {
  supplierAvailability: (supplierId: SupplierId) => `supplier:${supplierId}:available`,
} as const;
