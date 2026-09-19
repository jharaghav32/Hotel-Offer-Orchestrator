import { Router } from 'express';
import type { HotelController } from './hotel.controller';

export function createHotelRouter(controller: HotelController): Router {
  const router = Router();

  router.get('/hotels', controller.search);

  return router;
}

export function createHotelAdminRouter(controller: HotelController): Router {
  const router = Router();

  router.delete('/cache/:city', controller.evictCache);

  return router;
}
