import {
  ActivityFailure,
  ApplicationFailure,
  Client,
  Connection,
  ServiceError,
  TimeoutFailure,
  WorkflowFailedError,
} from '@temporalio/client';
import type { AggregatedHotelOffers } from '../domain/hotel';
import {
  AllSuppliersUnavailableError,
  type AppError,
  InternalError,
  ServiceUnavailableError,
} from '../shared/errors';
import { FailureType, HOTEL_OFFERS_WORKFLOW, hotelOffersWorkflowId } from './contracts';
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

export function toAppError(error: unknown): AppError {
  if (error instanceof WorkflowFailedError) {
    const { cause } = error;

    if (cause instanceof ApplicationFailure && cause.type === FailureType.AllSuppliersUnavailable) {
      return new AllSuppliersUnavailableError('All suppliers are unavailable', cause.details?.[0], {
        cause: error,
      });
    }
    if (cause instanceof TimeoutFailure) {
      return new ServiceUnavailableError('Hotel aggregation timed out', undefined, {
        cause: error,
      });
    }
    if (cause instanceof ActivityFailure) {
      return new ServiceUnavailableError('Hotel aggregation could not be completed', undefined, {
        cause: error,
      });
    }
    return new InternalError('Hotel aggregation failed', undefined, { cause: error });
  }

  if (error instanceof ServiceError) {
    return new ServiceUnavailableError('Workflow service is unavailable', undefined, {
      cause: error,
    });
  }

  return new InternalError('Hotel aggregation failed', undefined, { cause: error });
}

export class HotelOffersWorkflowClient implements HotelOffersWorkflowRunner {
  constructor(
    private readonly client: Client,
    private readonly options: HotelOffersWorkflowClientOptions,
  ) {}

  async run(city: string): Promise<AggregatedHotelOffers> {
    try {
      return await this.client.workflow.execute<typeof hotelOffersWorkflow>(HOTEL_OFFERS_WORKFLOW, {
        taskQueue: this.options.taskQueue,
        workflowId: hotelOffersWorkflowId(city),
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowExecutionTimeout: `${this.options.workflowTimeoutSeconds} seconds`,
        args: [{ city }],
      });
    } catch (error) {
      throw toAppError(error);
    }
  }
}
