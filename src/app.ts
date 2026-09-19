import express, { type Express } from 'express';
import { createErrorHandler } from './api/middleware/error-handler';
import { notFoundHandler } from './api/middleware/not-found';
import { createRequestLogger } from './api/middleware/request-logger';
import { HotelController } from './hotels/hotel.controller';
import { createHotelRouter } from './hotels/hotel.routes';
import type { HotelService } from './hotels/hotel.service';
import type { Logger } from './shared/logger';
import type { MockSupplierService } from './suppliers/mock-supplier.service';
import { SupplierController } from './suppliers/supplier.controller';
import { createSupplierAdminRouter, createSupplierRouter } from './suppliers/supplier.routes';

export interface AppDependencies {
  logger: Logger;
  supplierService: MockSupplierService;
  hotelService: HotelService;
}

export function createApp({ logger, supplierService, hotelService }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(createRequestLogger(logger));
  app.use(express.json({ limit: '100kb' }));

  const supplierController = new SupplierController(supplierService);
  app.use('/', createSupplierRouter(supplierController));
  app.use('/admin', createSupplierAdminRouter(supplierController));
  app.use('/api', createHotelRouter(new HotelController(hotelService)));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
