import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from '../../shared/logger';

const REQUEST_ID_PATTERN = /^[\w-]{1,100}$/;

function resolveRequestId(incoming: string | undefined): string {
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

export function createRequestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const requestId = resolveRequestId(req.get('x-request-id'));
    const startedAt = process.hrtime.bigint();

    res.locals.requestId = requestId;
    res.set('X-Request-Id', requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info(
        {
          requestId,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          durationMs: Math.round(durationMs * 10) / 10,
        },
        'Request completed',
      );
    });

    next();
  };
}
