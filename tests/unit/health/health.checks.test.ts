import { grpc } from '@temporalio/proto';
import { redisCheck, supplierCheck, temporalCheck } from '../../../src/health/health.checks';

const { SERVING, NOT_SERVING } = grpc.health.v1.HealthCheckResponse.ServingStatus;

const fakeConnection = (status: number) => ({
  healthService: {
    check: () => Promise.resolve({ status }),
  },
  withDeadline: <T>(_deadline: number | Date, fn: () => Promise<T>) => fn(),
});

describe('health checks', () => {
  it('probes a supplier by id', async () => {
    const probed: string[] = [];
    const check = supplierCheck('supplierB', {
      ping: (supplierId) => {
        probed.push(supplierId);
        return Promise.resolve();
      },
    });

    await check.run();

    expect(check).toMatchObject({ name: 'supplierB', kind: 'supplier' });
    expect(probed).toEqual(['supplierB']);
  });

  it('pings redis', async () => {
    await expect(
      redisCheck({ ping: () => Promise.resolve('PONG') }).run(),
    ).resolves.toBeUndefined();
    await expect(
      redisCheck({ ping: () => Promise.reject(new Error('ECONNREFUSED')) }).run(),
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('accepts a serving temporal frontend', async () => {
    await expect(temporalCheck(fakeConnection(SERVING), 100).run()).resolves.toBeUndefined();
  });

  it('rejects a temporal frontend that is not serving', async () => {
    await expect(temporalCheck(fakeConnection(NOT_SERVING), 100).run()).rejects.toThrow(
      `Temporal reported serving status ${NOT_SERVING}`,
    );
  });
});
