import { Router } from 'express';
import type { HealthController } from './health.controller';

export function createHealthRouter(controller: HealthController): Router {
  const router = Router();

  router.get('/', controller.readiness);
  router.get('/live', controller.liveness);

  return router;
}
