import type { Express } from 'express';
import { createApp } from '../../src/app';
import type { SupplierAvailabilityStore } from '../../src/cache/supplier-availability.repository';
import type { AggregatedHotelOffers } from '../../src/domain/hotel';
import type { HealthCheck } from '../../src/health/health.checks';
import { HealthService } from '../../src/health/health.service';
import { HotelService } from '../../src/hotels/hotel.service';
import { MockSupplierService } from '../../src/suppliers/mock-supplier.service';
import { StaticSupplierCatalog } from '../../src/suppliers/supplier.catalog';
import { FakeWorkflowRunner, type WorkflowBehaviour } from './fake-workflow-runner';
import { InMemoryHotelCache } from './in-memory-hotel-cache';
import { InMemorySupplierAvailabilityStore } from './in-memory-supplier-availability.store';
import { silentLogger } from './silent-logger';

export const delhiAggregate: AggregatedHotelOffers = {
  city: 'delhi',
  offers: [
    { name: 'Lemon Tree', price: 3200, supplier: 'Supplier A', commissionPct: 8 },
    { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
    { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
    { name: 'Oberoi', price: 8000, supplier: 'Supplier B', commissionPct: 15 },
  ],
  suppliers: { supplierA: 'ok', supplierB: 'ok' },
};

const defaultBehaviour: WorkflowBehaviour = (city) =>
  Promise.resolve(
    city === 'delhi'
      ? delhiAggregate
      : { city, offers: [], suppliers: { supplierA: 'ok', supplierB: 'ok' } },
  );

export interface TestAppOptions {
  availability?: SupplierAvailabilityStore;
  workflow?: WorkflowBehaviour;
  healthChecks?: HealthCheck[];
}

export interface TestApp {
  app: Express;
  hotelCache: InMemoryHotelCache;
  workflows: FakeWorkflowRunner;
}

export function buildTestApp({
  availability = new InMemorySupplierAvailabilityStore(),
  workflow = defaultBehaviour,
  healthChecks = [],
}: TestAppOptions = {}): TestApp {
  const hotelCache = new InMemoryHotelCache();
  const workflows = new FakeWorkflowRunner(hotelCache, workflow);

  const app = createApp({
    logger: silentLogger,
    supplierService: new MockSupplierService(
      new StaticSupplierCatalog(),
      availability,
      silentLogger,
    ),
    hotelService: new HotelService(hotelCache, workflows, silentLogger),
    healthService: new HealthService(healthChecks, { timeoutMs: 200 }),
  });

  return { app, hotelCache, workflows };
}
