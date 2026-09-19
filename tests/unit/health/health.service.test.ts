import type { HealthCheck, HealthCheckKind } from '../../../src/health/health.checks';
import { HealthService } from '../../../src/health/health.service';

const up = (name: string, kind: HealthCheckKind): HealthCheck => ({
  name,
  kind,
  run: () => Promise.resolve(),
});

const down = (
  name: string,
  kind: HealthCheckKind,
  message = `${name} unreachable`,
): HealthCheck => ({
  name,
  kind,
  run: () => Promise.reject(new Error(message)),
});

const hanging = (name: string, kind: HealthCheckKind): HealthCheck => ({
  name,
  kind,
  run: () => new Promise<void>(() => undefined),
});

const report = (checks: HealthCheck[]) =>
  new HealthService(checks, {
    timeoutMs: 50,
    now: () => new Date('2026-09-19T10:00:00.000Z'),
  }).report();

describe('HealthService', () => {
  it('is ok when every component is up', async () => {
    const result = await report([
      up('supplierA', 'supplier'),
      up('supplierB', 'supplier'),
      up('redis', 'dependency'),
      up('temporal', 'dependency'),
    ]);

    expect(result.status).toBe('ok');
    expect(result.timestamp).toBe('2026-09-19T10:00:00.000Z');
    expect(Object.keys(result.checks)).toEqual(['supplierA', 'supplierB', 'redis', 'temporal']);
    expect(result.checks.redis).toEqual({ status: 'up', latencyMs: expect.any(Number) });
  });

  it('is degraded when one supplier is down and reports the reason', async () => {
    const result = await report([
      up('supplierA', 'supplier'),
      down('supplierB', 'supplier', 'Supplier B responded with HTTP 503'),
      up('redis', 'dependency'),
    ]);

    expect(result.status).toBe('degraded');
    expect(result.checks.supplierB).toEqual({
      status: 'down',
      latencyMs: expect.any(Number),
      error: 'Supplier B responded with HTTP 503',
    });
  });

  it('is down when every supplier is down', async () => {
    const result = await report([
      down('supplierA', 'supplier'),
      down('supplierB', 'supplier'),
      up('redis', 'dependency'),
    ]);

    expect(result.status).toBe('down');
  });

  it('is down when a dependency is down', async () => {
    const result = await report([up('supplierA', 'supplier'), down('redis', 'dependency')]);

    expect(result.status).toBe('down');
  });

  it('marks a check that does not answer in time as down', async () => {
    const result = await report([hanging('temporal', 'dependency')]);

    expect(result.checks.temporal).toMatchObject({ status: 'down', error: 'Timed out after 50ms' });
  });

  it('runs the checks in parallel', async () => {
    const slow = (name: string): HealthCheck => ({
      name,
      kind: 'dependency',
      run: () => new Promise((resolve) => setTimeout(resolve, 30)),
    });
    const startedAt = Date.now();

    await report([slow('a'), slow('b'), slow('c')]);

    expect(Date.now() - startedAt).toBeLessThan(80);
  });
});
