import type { Logger } from './logger';

export interface ClosableServer {
  close(callback: (error?: Error) => void): unknown;
  closeAllConnections(): void;
}

export interface ShutdownResource {
  name: string;
  close: () => Promise<unknown>;
}

export interface GracefulShutdownOptions {
  server: ClosableServer;
  resources: readonly ShutdownResource[];
  logger: Logger;
  timeoutMs: number;
  exit?: (code: number) => void;
}

function defaultExit(code: number): void {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 500).unref();
}

function closeServer(server: ClosableServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export function createGracefulShutdown({
  server,
  resources,
  logger,
  timeoutMs,
  exit = defaultExit,
}: GracefulShutdownOptions): (signal: string) => Promise<void> {
  let inProgress = false;

  return async (signal) => {
    if (inProgress) {
      logger.warn({ signal }, 'Shutdown already in progress');
      return;
    }
    inProgress = true;
    logger.info({ signal, timeoutMs }, 'Shutdown started');

    let failed = false;
    const forceClose = setTimeout(() => {
      logger.warn('Shutdown timeout reached, closing remaining connections');
      server.closeAllConnections();
    }, timeoutMs);
    forceClose.unref();

    try {
      await closeServer(server);
      logger.info('HTTP server closed');
    } catch (error) {
      failed = true;
      logger.error({ err: error }, 'HTTP server failed to close cleanly');
    } finally {
      clearTimeout(forceClose);
    }

    for (const resource of resources) {
      try {
        await resource.close();
        logger.info({ resource: resource.name }, 'Resource closed');
      } catch (error) {
        failed = true;
        logger.error({ err: error, resource: resource.name }, 'Resource failed to close');
      }
    }

    logger.info({ exitCode: failed ? 1 : 0 }, 'Shutdown complete');
    exit(failed ? 1 : 0);
  };
}

export function onShutdownSignals(
  handler: (signal: string) => Promise<void>,
  signals: readonly NodeJS.Signals[] = ['SIGTERM', 'SIGINT'],
): void {
  for (const signal of signals) {
    process.once(signal, () => void handler(signal));
  }
}
