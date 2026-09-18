import type { Redis } from 'ioredis';
import type { SupplierId } from '../domain/supplier';
import { redisKeys } from './keys';

export interface SupplierAvailabilityStore {
  isAvailable(supplierId: SupplierId): Promise<boolean>;
  setAvailable(supplierId: SupplierId, available: boolean): Promise<void>;
}

export class RedisSupplierAvailabilityStore implements SupplierAvailabilityStore {
  constructor(private readonly redis: Redis) {}

  async isAvailable(supplierId: SupplierId): Promise<boolean> {
    const value = await this.redis.get(redisKeys.supplierAvailability(supplierId));
    return value !== 'false';
  }

  async setAvailable(supplierId: SupplierId, available: boolean): Promise<void> {
    await this.redis.set(redisKeys.supplierAvailability(supplierId), String(available));
  }
}
