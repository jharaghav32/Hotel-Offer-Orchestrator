import request from 'supertest';
import { AllSuppliersUnavailableError, ServiceUnavailableError } from '../../../src/shared/errors';
import { buildTestApp, delhiAggregate } from '../../support/test-app';

describe('GET /api/hotels', () => {
  it('returns the best offer per hotel in the documented response format', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/hotels').query({ city: 'delhi' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual(delhiAggregate.offers);
    expect(response.headers['x-cache']).toBe('MISS');
    expect(response.headers['x-unavailable-suppliers']).toBeUndefined();
  });

  it('filters by price range and serves repeated requests from the cache', async () => {
    const { app, workflows } = buildTestApp();
    await request(app).get('/api/hotels').query({ city: 'delhi' });

    const response = await request(app)
      .get('/api/hotels')
      .query({ city: 'Delhi', minPrice: '5000', maxPrice: '7000' });

    expect(response.status).toBe(200);
    expect(response.headers['x-cache']).toBe('HIT');
    expect(response.body.map((offer: { name: string }) => offer.name)).toEqual([
      'Holtin',
      'Radison',
    ]);
    expect(workflows.runs).toEqual(['delhi']);
  });

  it('returns an empty array for a city without hotels', async () => {
    const { app } = buildTestApp();

    const response = await request(app).get('/api/hotels').query({ city: 'paris' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('flags suppliers that were unavailable during aggregation', async () => {
    const { app } = buildTestApp({
      workflow: () =>
        Promise.resolve({
          ...delhiAggregate,
          suppliers: { supplierA: 'ok', supplierB: 'failed' },
        }),
    });

    const response = await request(app).get('/api/hotels').query({ city: 'delhi' });

    expect(response.status).toBe(200);
    expect(response.headers['x-unavailable-suppliers']).toBe('supplierB');
  });

  it('returns 400 for invalid input without starting a workflow', async () => {
    const { app, workflows } = buildTestApp();

    const response = await request(app)
      .get('/api/hotels')
      .query({ city: 'delhi', minPrice: '7000', maxPrice: '5000' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'maxPrice: maxPrice must be greater than or equal to minPrice',
    });
    expect(workflows.runs).toEqual([]);
  });

  it('returns 502 when every supplier is unavailable', async () => {
    const { app } = buildTestApp({
      workflow: () =>
        Promise.reject(
          new AllSuppliersUnavailableError('All suppliers are unavailable', {
            suppliers: { supplierA: 'failed', supplierB: 'failed' },
          }),
        ),
    });

    const response = await request(app).get('/api/hotels').query({ city: 'goa' });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: 'ALL_SUPPLIERS_UNAVAILABLE',
        message: 'All suppliers are unavailable',
        details: { suppliers: { supplierA: 'failed', supplierB: 'failed' } },
      },
    });
  });

  it('returns 503 when the orchestration service is unavailable', async () => {
    const { app } = buildTestApp({
      workflow: () =>
        Promise.reject(new ServiceUnavailableError('Workflow service is unavailable')),
    });

    const response = await request(app).get('/api/hotels').query({ city: 'delhi' });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('echoes a valid incoming request id and generates one otherwise', async () => {
    const { app } = buildTestApp();

    const echoed = await request(app)
      .get('/api/hotels?city=delhi')
      .set('X-Request-Id', 'trace-123');
    const generated = await request(app)
      .get('/api/hotels?city=delhi')
      .set('X-Request-Id', 'bad id!');

    expect(echoed.headers['x-request-id']).toBe('trace-123');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  describe('DELETE /admin/cache/:city', () => {
    it('evicts the city so the next search is a cache miss', async () => {
      const { app, workflows } = buildTestApp();
      await request(app).get('/api/hotels').query({ city: 'delhi' });

      const evicted = await request(app).delete('/admin/cache/Delhi');
      const next = await request(app).get('/api/hotels').query({ city: 'delhi' });

      expect(evicted.status).toBe(204);
      expect(next.headers['x-cache']).toBe('MISS');
      expect(workflows.runs).toEqual(['delhi', 'delhi']);
    });

    it('is idempotent for cities that are not cached', async () => {
      const { app } = buildTestApp();

      const response = await request(app).delete('/admin/cache/goa');

      expect(response.status).toBe(204);
    });

    it('rejects an invalid city', async () => {
      const { app } = buildTestApp();

      const response = await request(app).delete('/admin/cache/de$lhi');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
