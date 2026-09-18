import type { RequestHandler } from 'express';
import { NotFoundError } from '../../shared/errors';

export const notFoundHandler: RequestHandler = (req) => {
  throw new NotFoundError(`Route ${req.method} ${req.path} not found`);
};
