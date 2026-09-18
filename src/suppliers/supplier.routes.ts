import { Router } from 'express';
import { SUPPLIER_IDS } from '../domain/supplier';
import type { SupplierController } from './supplier.controller';

export function createSupplierRouter(controller: SupplierController): Router {
  const router = Router();

  for (const supplierId of SUPPLIER_IDS) {
    router.get(`/${supplierId}/hotels`, controller.listHotels(supplierId));
  }

  return router;
}

export function createSupplierAdminRouter(controller: SupplierController): Router {
  const router = Router();

  router.get('/suppliers', controller.listAvailability);
  router.patch('/suppliers/:supplierId', controller.setAvailability);

  return router;
}
