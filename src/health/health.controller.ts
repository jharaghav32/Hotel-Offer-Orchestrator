import type { Request, Response } from 'express';
import type { HealthService } from './health.service';

export class HealthController {
  constructor(private readonly service: HealthService) {}

  readiness = async (_req: Request, res: Response) => {
    const report = await this.service.report();
    res.set('Cache-Control', 'no-store');
    res.status(report.status === 'down' ? 503 : 200).json(report);
  };

  liveness = (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok' });
  };
}
