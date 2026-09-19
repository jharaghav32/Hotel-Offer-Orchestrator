import type { Redis } from 'ioredis';
import type { SupplierId } from '../domain/supplier';
import { ServiceUnavailableError } from '../shared/errors';
import { redisKeys } from './keys';

export interface SupplierAvailabilityStore {
  isAvailable(supplierId: SupplierId): Promise<boolean>;
  setAvailable(supplierId: SupplierId, available: boolean): Promise<void>;
}

function storeUnavailable(error: unknown): ServiceUnavailableError {
  return new ServiceUnavailableError('Supplier availability store is unavailable', undefined, {
    cause: error,
  });
}

export class RedisSupplierAvailabilityStore implements SupplierAvailabilityStore {
  constructor(private readonly redis: Redis) {}

  async isAvailable(supplierId: SupplierId): Promise<boolean> {
    try {
      const value = await this.redis.get(redisKeys.supplierAvailability(supplierId));
      return value !== 'false';
    } catch (error) {
      throw storeUnavailable(error);
    }
  }

  async setAvailable(supplierId: SupplierId, available: boolean): Promise<void> {
    try {
      await this.redis.set(redisKeys.supplierAvailability(supplierId), String(available));
    } catch (error) {
      throw storeUnavailable(error);
    }
  }
}
