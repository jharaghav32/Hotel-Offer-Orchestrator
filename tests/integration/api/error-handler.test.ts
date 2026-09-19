import request from 'supertest';
import { buildTestApp } from '../../support/test-app';

describe('error handler', () => {
  it('hides internal details of unexpected failures behind a generic 500', async () => {
    const { app } = buildTestApp({
      workflow: () => Promise.reject(new Error('ECONNREFUSED 10.0.0.5:6379')),
    });

    const response = await request(app).get('/api/hotels').query({ city: 'delhi' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});
