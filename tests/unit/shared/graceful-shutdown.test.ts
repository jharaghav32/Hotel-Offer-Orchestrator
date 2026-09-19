import { createGracefulShutdown, type ClosableServer } from '../../../src/shared/graceful-shutdown';
import { silentLogger } from '../../support/silent-logger';

function fakeServer(closeDelayMs = 0, closeError?: Error) {
  const events: string[] = [];
  const server: ClosableServer = {
    close: (callback) => {
      events.push('server.close');
      setTimeout(() => callback(closeError), closeDelayMs);
    },
    closeAllConnections: () => {
      events.push('server.closeAllConnections');
    },
  };
  return { server, events };
}

describe('createGracefulShutdown', () => {
  it('closes the server first, then every resource in order, and exits with 0', async () => {
    const { server, events } = fakeServer();
    const exits: number[] = [];
    const shutdown = createGracefulShutdown({
      server,
      logger: silentLogger,
      timeoutMs: 1000,
      exit: (code) => exits.push(code),
      resources: [
        { name: 'temporal', close: () => Promise.resolve(events.push('temporal.close')) },
        { name: 'redis', close: () => Promise.resolve(events.push('redis.close')) },
      ],
    });

    await shutdown('SIGTERM');

    expect(events).toEqual(['server.close', 'temporal.close', 'redis.close']);
    expect(exits).toEqual([0]);
  });

  it('keeps closing remaining resources when one fails and exits with 1', async () => {
    const { server, events } = fakeServer();
    const exits: number[] = [];
    const shutdown = createGracefulShutdown({
      server,
      logger: silentLogger,
      timeoutMs: 1000,
      exit: (code) => exits.push(code),
      resources: [
        { name: 'temporal', close: () => Promise.reject(new Error('already closed')) },
        { name: 'redis', close: () => Promise.resolve(events.push('redis.close')) },
      ],
    });

    await shutdown('SIGTERM');

    expect(events).toContain('redis.close');
    expect(exits).toEqual([1]);
  });

  it('force-closes open connections when in-flight requests exceed the timeout', async () => {
    const { server, events } = fakeServer(80);
    const shutdown = createGracefulShutdown({
      server,
      logger: silentLogger,
      timeoutMs: 20,
      exit: () => undefined,
      resources: [],
    });

    await shutdown('SIGTERM');

    expect(events).toEqual(['server.close', 'server.closeAllConnections']);
  });

  it('ignores repeated signals while a shutdown is in progress', async () => {
    const { server, events } = fakeServer(20);
    const exits: number[] = [];
    const shutdown = createGracefulShutdown({
      server,
      logger: silentLogger,
      timeoutMs: 1000,
      exit: (code) => exits.push(code),
      resources: [],
    });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(events.filter((event) => event === 'server.close')).toHaveLength(1);
    expect(exits).toEqual([0]);
  });
});
