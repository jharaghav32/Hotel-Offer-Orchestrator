import request from 'supertest';
import type { HealthCheck } from '../../../src/health/health.checks';
import { buildTestApp } from '../../support/test-app';

const check = (name: string, kind: HealthCheck['kind'], healthy: boolean): HealthCheck => ({
  name,
  kind,
  run: () => (healthy ? Promise.resolve() : Promise.reject(new Error(`${name} unreachable`))),
});

const allUp = [
  check('supplierA', 'supplier', true),
  check('supplierB', 'supplier', true),
  check('redis', 'dependency', true),
  check('temporal', 'dependency', true),
];

describe('health routes', () => {
  it('GET /health returns 200 with every component when all are up', async () => {
    const { app } = buildTestApp({ healthChecks: allUp });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
      checks: {
        supplierA: { status: 'up', latencyMs: expect.any(Number) },
        supplierB: { status: 'up', latencyMs: expect.any(Number) },
        redis: { status: 'up', latencyMs: expect.any(Number) },
        temporal: { status: 'up', latencyMs: expect.any(Number) },
      },
    });
  });

  it('GET /health stays 200 but reports degraded when one supplier is down', async () => {
    const { app } = buildTestApp({
      healthChecks: [
        ...allUp.filter((c) => c.name !== 'supplierB'),
        check('supplierB', 'supplier', false),
      ],
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('degraded');
    expect(response.body.checks.supplierB).toMatchObject({
      status: 'down',
      error: 'supplierB unreachable',
    });
  });

  it('GET /health returns 503 when a dependency is down', async () => {
    const { app } = buildTestApp({
      healthChecks: [
        ...allUp.filter((c) => c.name !== 'redis'),
        check('redis', 'dependency', false),
      ],
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('down');
  });

  it('GET /health/live answers without touching dependencies', async () => {
    const { app } = buildTestApp({ healthChecks: [check('redis', 'dependency', false)] });

    const response = await request(app).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
