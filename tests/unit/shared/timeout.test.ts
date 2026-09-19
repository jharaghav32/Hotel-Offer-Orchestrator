import { TimeoutError, withTimeout } from '../../../src/shared/timeout';

describe('withTimeout', () => {
  it('resolves with the task result when it finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 100)).resolves.toBe('done');
  });

  it('propagates the task rejection', async () => {
    const failure = new Error('boom');
    await expect(withTimeout(Promise.reject(failure), 100)).rejects.toBe(failure);
  });

  it('rejects with a TimeoutError when the task is too slow', async () => {
    const never = new Promise<never>(() => undefined);

    await expect(withTimeout(never, 20)).rejects.toEqual(new TimeoutError('Timed out after 20ms'));
  });
});
