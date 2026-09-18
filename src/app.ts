import express, { type Express } from 'express';
import { createErrorHandler } from './api/middleware/error-handler';
import { notFoundHandler } from './api/middleware/not-found';
import type { Logger } from './shared/logger';
import { SupplierController } from './suppliers/supplier.controller';
import type { MockSupplierService } from './suppliers/mock-supplier.service';
import { createSupplierAdminRouter, createSupplierRouter } from './suppliers/supplier.routes';

export interface AppDependencies {
  logger: Logger;
  supplierService: MockSupplierService;
}

export function createApp({ logger, supplierService }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '100kb' }));

  const supplierController = new SupplierController(supplierService);
  app.use('/', createSupplierRouter(supplierController));
  app.use('/admin', createSupplierAdminRouter(supplierController));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
