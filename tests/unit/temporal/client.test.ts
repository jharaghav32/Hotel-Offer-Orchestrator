import {
  ActivityFailure,
  ApplicationFailure,
  ServiceError,
  TimeoutFailure,
  WorkflowFailedError,
} from '@temporalio/client';
import { RetryState, TimeoutType } from '@temporalio/common';
import {
  AllSuppliersUnavailableError,
  InternalError,
  ServiceUnavailableError,
} from '../../../src/shared/errors';
import { toAppError } from '../../../src/temporal/client';
import { FailureType } from '../../../src/temporal/contracts';

const workflowFailed = (cause: Error) =>
  new WorkflowFailedError('Workflow execution failed', cause, RetryState.NON_RETRYABLE_FAILURE);

describe('toAppError', () => {
  it('maps AllSuppliersUnavailable to a 502 with the supplier outcomes as details', () => {
    const cause = ApplicationFailure.nonRetryable(
      'All suppliers are unavailable',
      FailureType.AllSuppliersUnavailable,
      {
        city: 'goa',
        suppliers: { supplierA: 'failed', supplierB: 'failed' },
      },
    );

    const error = toAppError(workflowFailed(cause));

    expect(error).toBeInstanceOf(AllSuppliersUnavailableError);
    expect(error.statusCode).toBe(502);
    expect(error.details).toEqual({
      city: 'goa',
      suppliers: { supplierA: 'failed', supplierB: 'failed' },
    });
  });

  it('maps a workflow timeout to a 503', () => {
    const cause = new TimeoutFailure(
      'Workflow execution timed out',
      undefined,
      TimeoutType.START_TO_CLOSE,
    );

    expect(toAppError(workflowFailed(cause))).toBeInstanceOf(ServiceUnavailableError);
  });

  it('maps an exhausted activity (cache write) to a 503', () => {
    const cause = new ActivityFailure(
      'Activity task failed',
      'cacheHotelOffers',
      '1',
      RetryState.MAXIMUM_ATTEMPTS_REACHED,
      'worker',
    );

    expect(toAppError(workflowFailed(cause))).toBeInstanceOf(ServiceUnavailableError);
  });

  it('maps an unreachable Temporal service to a 503', () => {
    const error = toAppError(new ServiceError('Failed to start Workflow'));

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error.message).toBe('Workflow service is unavailable');
  });

  it('maps anything else to a 500', () => {
    expect(
      toAppError(workflowFailed(ApplicationFailure.create({ message: 'bug' }))),
    ).toBeInstanceOf(InternalError);
    expect(toAppError(new Error('unknown'))).toBeInstanceOf(InternalError);
  });
});
