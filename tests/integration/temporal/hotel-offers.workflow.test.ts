import { randomUUID } from 'node:crypto';
import { ApplicationFailure } from '@temporalio/common';
import { WorkflowFailedError } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { DefaultLogger, Runtime, Worker } from '@temporalio/worker';
import type { AggregatedHotelOffers, SupplierHotel } from '../../../src/domain/hotel';
import type { SupplierId } from '../../../src/domain/supplier';
import type { HotelOffersActivities } from '../../../src/temporal/activities/hotel-offers.activities';
import { FailureType, type FetchSupplierHotelsInput } from '../../../src/temporal/contracts';
import { hotelOffersWorkflow } from '../../../src/temporal/workflows';

jest.setTimeout(120_000);

const inventory: Record<SupplierId, SupplierHotel[]> = {
  supplierA: [
    { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
    { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
  ],
  supplierB: [
    { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
    { hotelId: 'b2', name: 'Oberoi', price: 8000, city: 'delhi', commissionPct: 15 },
  ],
};

type FetchBehaviour = (
  input: FetchSupplierHotelsInput,
  attempt: number,
) => Promise<SupplierHotel[]>;

const healthy: FetchBehaviour = ({ supplierId }) => Promise.resolve(inventory[supplierId]);

const down =
  (supplierId: SupplierId): FetchBehaviour =>
  (input, attempt) =>
    input.supplierId === supplierId
      ? Promise.reject(
          ApplicationFailure.nonRetryable(`${supplierId} down`, FailureType.SupplierRequestFailed),
        )
      : healthy(input, attempt);

describe('hotelOffersWorkflow', () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    Runtime.install({ logger: new DefaultLogger('ERROR') });
    env = await TestWorkflowEnvironment.createLocal();
  });

  afterAll(async () => {
    await env?.teardown();
  });

  async function runWorkflow(behaviour: FetchBehaviour) {
    const taskQueue = `test-${randomUUID()}`;
    const attempts = new Map<SupplierId, number>();
    const cached: AggregatedHotelOffers[] = [];

    const activities: HotelOffersActivities = {
      fetchSupplierHotels: (input) => {
        const attempt = (attempts.get(input.supplierId) ?? 0) + 1;
        attempts.set(input.supplierId, attempt);
        return behaviour(input, attempt);
      },
      cacheHotelOffers: (aggregate) => {
        cached.push(aggregate);
        return Promise.resolve();
      },
    };

    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: require.resolve('../../../src/temporal/workflows'),
      activities,
    });

    const execution = worker.runUntil(
      env.client.workflow.execute(hotelOffersWorkflow, {
        taskQueue,
        workflowId: `hotel-offers-test-${randomUUID()}`,
        args: [{ city: 'delhi' }],
      }),
    );

    return { execution, attempts, cached };
  }

  it('fetches both suppliers, keeps the cheapest offer per hotel and caches the result', async () => {
    const { execution, cached } = await runWorkflow(healthy);
    const result = await execution;

    expect(result).toEqual({
      city: 'delhi',
      offers: [
        { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
        { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
        { name: 'Oberoi', price: 8000, supplier: 'Supplier B', commissionPct: 15 },
      ],
      suppliers: { supplierA: 'ok', supplierB: 'ok' },
    });
    expect(cached).toEqual([result]);
  });

  it('continues with the remaining supplier when one supplier fails', async () => {
    const { execution, cached } = await runWorkflow(down('supplierB'));
    const result = await execution;

    expect(result.suppliers).toEqual({ supplierA: 'ok', supplierB: 'failed' });
    expect(result.offers.map((offer) => offer.supplier)).toEqual(['Supplier A', 'Supplier A']);
    expect(cached).toHaveLength(1);
  });

  it('fails with AllSuppliersUnavailable and caches nothing when every supplier fails', async () => {
    const { execution, cached } = await runWorkflow(() =>
      Promise.reject(ApplicationFailure.nonRetryable('down', FailureType.SupplierRequestFailed)),
    );

    const error = await execution.catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WorkflowFailedError);
    expect((error as WorkflowFailedError).cause).toMatchObject({
      type: FailureType.AllSuppliersUnavailable,
      message: 'All suppliers are unavailable',
    });
    expect(cached).toHaveLength(0);
  });

  it('retries a transient supplier failure and recovers', async () => {
    const flaky: FetchBehaviour = (input, attempt) =>
      input.supplierId === 'supplierA' && attempt === 1
        ? Promise.reject(ApplicationFailure.retryable('timeout', FailureType.SupplierRequestFailed))
        : healthy(input, attempt);

    const { execution, attempts } = await runWorkflow(flaky);
    const result = await execution;

    expect(attempts.get('supplierA')).toBe(2);
    expect(result.suppliers).toEqual({ supplierA: 'ok', supplierB: 'ok' });
  });

  it('gives up on a supplier after the maximum number of retries', async () => {
    const alwaysTimingOut: FetchBehaviour = (input, attempt) =>
      input.supplierId === 'supplierB'
        ? Promise.reject(ApplicationFailure.retryable('timeout', FailureType.SupplierRequestFailed))
        : healthy(input, attempt);

    const { execution, attempts } = await runWorkflow(alwaysTimingOut);
    const result = await execution;

    expect(attempts.get('supplierB')).toBe(3);
    expect(result.suppliers).toEqual({ supplierA: 'ok', supplierB: 'failed' });
  });
});
