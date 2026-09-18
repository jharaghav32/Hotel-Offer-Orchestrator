import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseInput } from '../api/validation';
import { isSupplierId, type SupplierId } from '../domain/supplier';
import { NotFoundError } from '../shared/errors';
import type { MockSupplierService } from './mock-supplier.service';

const hotelsQuerySchema = z.object({
  city: z.string().trim().min(1, 'must not be empty').optional(),
});

const availabilityBodySchema = z.strictObject({
  available: z.boolean({ error: 'must be a boolean' }),
});

function resolveSupplierId(value: unknown): SupplierId {
  if (typeof value !== 'string' || !isSupplierId(value)) {
    throw new NotFoundError(`Supplier '${String(value)}' does not exist`);
  }
  return value;
}

export class SupplierController {
  constructor(private readonly service: MockSupplierService) {}

  listHotels = (supplierId: SupplierId) => async (req: Request, res: Response) => {
    const { city } = parseInput(hotelsQuerySchema, req.query);
    res.json(await this.service.listHotels(supplierId, city));
  };

  listAvailability = async (_req: Request, res: Response) => {
    res.json(await this.service.listAvailability());
  };

  setAvailability = async (req: Request, res: Response) => {
    const supplierId = resolveSupplierId(req.params.supplierId);
    const { available } = parseInput(availabilityBodySchema, req.body);
    res.json(await this.service.setAvailability(supplierId, available));
  };
}
