import request from 'supertest';
import type { SupplierAvailabilityStore } from '../../../src/cache/supplier-availability.repository';
import { buildTestApp } from '../../support/test-app';

describe('error handler', () => {
  it('hides internal details of unexpected failures behind a generic 500', async () => {
    const brokenStore: SupplierAvailabilityStore = {
      isAvailable: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:6379')),
      setAvailable: () => Promise.resolve(),
    };
    const { app } = buildTestApp({ availability: brokenStore });

    const response = await request(app).get('/supplierA/hotels');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});
