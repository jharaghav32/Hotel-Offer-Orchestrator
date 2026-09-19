export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'SUPPLIER_UNAVAILABLE'
  | 'ALL_SUPPLIERS_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly statusCode: number;

  constructor(
    message: string,
    public readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
}

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;
}

export class SupplierUnavailableError extends AppError {
  readonly code = 'SUPPLIER_UNAVAILABLE';
  readonly statusCode = 503;
}

export class AllSuppliersUnavailableError extends AppError {
  readonly code = 'ALL_SUPPLIERS_UNAVAILABLE';
  readonly statusCode = 502;
}

export class ServiceUnavailableError extends AppError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly statusCode = 503;
}

export class InternalError extends AppError {
  readonly code = 'INTERNAL_ERROR';
  readonly statusCode = 500;
}
