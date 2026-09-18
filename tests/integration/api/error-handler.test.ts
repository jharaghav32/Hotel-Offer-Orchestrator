import request from 'supertest';
import { createApp } from '../../../src/app';
import type { SupplierAvailabilityStore } from '../../../src/cache/supplier-availability.repository';
import { MockSupplierService } from '../../../src/suppliers/mock-supplier.service';
import { StaticSupplierCatalog } from '../../../src/suppliers/supplier.catalog';
import { silentLogger } from '../../support/silent-logger';

describe('error handler', () => {
  it('hides internal details of unexpected failures behind a generic 500', async () => {
    const brokenStore: SupplierAvailabilityStore = {
      isAvailable: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:6379')),
      setAvailable: () => Promise.resolve(),
    };
    const app = createApp({
      logger: silentLogger,
      supplierService: new MockSupplierService(new StaticSupplierCatalog(), brokenStore),
    });

    const response = await request(app).get('/supplierA/hotels');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});
