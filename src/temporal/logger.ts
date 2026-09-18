import type { Logger as TemporalLogger, LogLevel, LogMetadata } from '@temporalio/worker';
import type { Logger } from '../shared/logger';

const LEVELS = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const satisfies Record<LogLevel, string>;

export class PinoTemporalLogger implements TemporalLogger {
  constructor(private readonly logger: Logger) {}

  log(level: LogLevel, message: string, meta: LogMetadata = {}): void {
    this.logger[LEVELS[level]](meta, message);
  }

  trace(message: string, meta?: LogMetadata): void {
    this.log('TRACE', message, meta);
  }

  debug(message: string, meta?: LogMetadata): void {
    this.log('DEBUG', message, meta);
  }

  info(message: string, meta?: LogMetadata): void {
    this.log('INFO', message, meta);
  }

  warn(message: string, meta?: LogMetadata): void {
    this.log('WARN', message, meta);
  }

  error(message: string, meta?: LogMetadata): void {
    this.log('ERROR', message, meta);
  }
}
