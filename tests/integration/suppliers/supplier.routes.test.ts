import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/app';
import { MockSupplierService } from '../../../src/suppliers/mock-supplier.service';
import { StaticSupplierCatalog } from '../../../src/suppliers/supplier.catalog';
import { InMemorySupplierAvailabilityStore } from '../../support/in-memory-supplier-availability.store';
import { silentLogger } from '../../support/silent-logger';

describe('supplier routes', () => {
  let app: Express;

  beforeEach(() => {
    const supplierService = new MockSupplierService(
      new StaticSupplierCatalog(),
      new InMemorySupplierAvailabilityStore(),
    );
    app = createApp({ logger: silentLogger, supplierService });
  });

  describe('GET /:supplierId/hotels', () => {
    it.each(['supplierA', 'supplierB'])('returns %s hotels for a city', async (supplierId) => {
      const response = await request(app).get(`/${supplierId}/hotels`).query({ city: 'delhi' });

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toEqual({
        hotelId: expect.any(String),
        name: expect.any(String),
        price: expect.any(Number),
        city: 'delhi',
        commissionPct: expect.any(Number),
      });
    });

    it('returns every hotel when city is omitted', async () => {
      const response = await request(app).get('/supplierA/hotels');

      expect(response.status).toBe(200);
      expect(
        new Set(response.body.map((hotel: { city: string }) => hotel.city)).size,
      ).toBeGreaterThan(1);
    });

    it('returns an empty array for a city with no hotels', async () => {
      const response = await request(app).get('/supplierA/hotels').query({ city: 'paris' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('rejects an empty city', async () => {
      const response = await request(app).get('/supplierA/hotels').query({ city: '  ' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 503 when the supplier is disabled', async () => {
      await request(app).patch('/admin/suppliers/supplierB').send({ available: false });

      const response = await request(app).get('/supplierB/hotels').query({ city: 'delhi' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error: { code: 'SUPPLIER_UNAVAILABLE', message: 'Supplier B is currently unavailable' },
      });
    });
  });

  describe('admin supplier availability', () => {
    it('lists availability of all suppliers', async () => {
      const response = await request(app).get('/admin/suppliers');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { supplierId: 'supplierA', name: 'Supplier A', available: true },
        { supplierId: 'supplierB', name: 'Supplier B', available: true },
      ]);
    });

    it('toggles a supplier off and on again', async () => {
      const off = await request(app).patch('/admin/suppliers/supplierA').send({ available: false });
      expect(off.body).toEqual({ supplierId: 'supplierA', name: 'Supplier A', available: false });

      await request(app).patch('/admin/suppliers/supplierA').send({ available: true });
      const response = await request(app).get('/supplierA/hotels');

      expect(response.status).toBe(200);
    });

    it('returns 404 for an unknown supplier', async () => {
      const response = await request(app)
        .patch('/admin/suppliers/supplierZ')
        .send({ available: false });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it.each([
      [{}, 'missing flag'],
      [{ available: 'no' }, 'non-boolean flag'],
      [{ available: false, extra: 1 }, 'unknown field'],
    ])('rejects %j (%s)', async (body, _case) => {
      const response = await request(app).patch('/admin/suppliers/supplierA').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects malformed JSON', async () => {
      const response = await request(app)
        .patch('/admin/suppliers/supplierA')
        .set('Content-Type', 'application/json')
        .send('{"available":');

      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Request body is not valid JSON',
      });
    });
  });

  it('returns 404 for unknown routes', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
