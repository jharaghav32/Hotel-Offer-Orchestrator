import { Client, Connection } from '@temporalio/client';
import type { AggregatedHotelOffers } from '../domain/hotel';
import { HOTEL_OFFERS_WORKFLOW, hotelOffersWorkflowId } from './contracts';
import type { hotelOffersWorkflow } from './workflows';

export interface TemporalClientOptions {
  address: string;
  namespace: string;
}

export function createTemporalClient({ address, namespace }: TemporalClientOptions): Client {
  return new Client({ connection: Connection.lazy({ address }), namespace });
}

export interface HotelOffersWorkflowRunner {
  run(city: string): Promise<AggregatedHotelOffers>;
}

export interface HotelOffersWorkflowClientOptions {
  taskQueue: string;
  workflowTimeoutSeconds: number;
}

export class HotelOffersWorkflowClient implements HotelOffersWorkflowRunner {
  constructor(
    private readonly client: Client,
    private readonly options: HotelOffersWorkflowClientOptions,
  ) {}

  run(city: string): Promise<AggregatedHotelOffers> {
    return this.client.workflow.execute<typeof hotelOffersWorkflow>(HOTEL_OFFERS_WORKFLOW, {
      taskQueue: this.options.taskQueue,
      workflowId: hotelOffersWorkflowId(city),
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowExecutionTimeout: `${this.options.workflowTimeoutSeconds} seconds`,
      args: [{ city }],
    });
  }
}
