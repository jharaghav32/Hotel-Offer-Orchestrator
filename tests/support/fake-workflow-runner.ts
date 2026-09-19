import type { HotelCacheWriter } from '../../src/cache/hotel-cache.repository';
import type { AggregatedHotelOffers } from '../../src/domain/hotel';
import type { HotelOffersWorkflowRunner } from '../../src/temporal/client';

export type WorkflowBehaviour = (city: string) => Promise<AggregatedHotelOffers>;

export class FakeWorkflowRunner implements HotelOffersWorkflowRunner {
  readonly runs: string[] = [];

  constructor(
    private readonly cache: HotelCacheWriter,
    private behaviour: WorkflowBehaviour,
  ) {}

  respondWith(behaviour: WorkflowBehaviour): void {
    this.behaviour = behaviour;
  }

  async run(city: string): Promise<AggregatedHotelOffers> {
    this.runs.push(city);
    const aggregate = await this.behaviour(city);
    await this.cache.save({ ...aggregate, fetchedAt: '2026-09-19T10:00:00.000Z' });
    return aggregate;
  }
}
