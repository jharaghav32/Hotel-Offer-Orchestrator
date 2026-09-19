import { grpc } from '@temporalio/proto';
import type { SupplierId } from '../domain/supplier';
import type { SupplierProbe } from '../suppliers/supplier.client';

export type HealthCheckKind = 'supplier' | 'dependency';

export interface HealthCheck {
  name: string;
  kind: HealthCheckKind;
  run(): Promise<void>;
}

const { SERVING } = grpc.health.v1.HealthCheckResponse.ServingStatus;

export function supplierCheck(supplierId: SupplierId, probe: SupplierProbe): HealthCheck {
  return {
    name: supplierId,
    kind: 'supplier',
    run: () => probe.ping(supplierId),
  };
}

export interface Pingable {
  ping(): Promise<unknown>;
}

export function redisCheck(redis: Pingable): HealthCheck {
  return {
    name: 'redis',
    kind: 'dependency',
    run: async () => {
      await redis.ping();
    },
  };
}

export interface TemporalHealthSource {
  healthService: { check(request: object): Promise<{ status?: number | null }> };
  withDeadline<T>(deadline: number | Date, fn: () => Promise<T>): Promise<T>;
}

export function temporalCheck(connection: TemporalHealthSource, timeoutMs: number): HealthCheck {
  return {
    name: 'temporal',
    kind: 'dependency',
    run: async () => {
      const { status } = await connection.withDeadline(Date.now() + timeoutMs, () =>
        connection.healthService.check({}),
      );
      if (status !== SERVING) {
        throw new Error(`Temporal reported serving status ${status}`);
      }
    },
  };
}
