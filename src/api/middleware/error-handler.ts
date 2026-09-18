import type { ErrorRequestHandler } from 'express';
import { AppError, InternalError, ValidationError } from '../../shared/errors';
import type { Logger } from '../../shared/logger';

function isBodyParseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  );
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (isBodyParseError(error)) {
    return new ValidationError('Request body is not valid JSON');
  }
  return new InternalError('Internal server error', undefined, { cause: error });
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    const appError = toAppError(error);
    const context = { method: req.method, path: req.path, code: appError.code };

    if (appError instanceof InternalError) {
      logger.error({ ...context, err: error }, 'Unhandled error');
    } else {
      logger.warn(context, appError.message);
    }

    res.status(appError.statusCode).json({
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details !== undefined && { details: appError.details }),
      },
    });
  };
}
