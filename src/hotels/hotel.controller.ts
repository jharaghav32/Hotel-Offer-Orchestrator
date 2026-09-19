import type { Request, Response } from 'express';
import { parseInput } from '../api/validation';
import { hotelSearchQuerySchema } from './hotel.query';
import type { HotelService } from './hotel.service';

export class HotelController {
  constructor(private readonly service: HotelService) {}

  search = async (req: Request, res: Response) => {
    const query = parseInput(hotelSearchQuerySchema, req.query);
    const result = await this.service.search(query);

    res.set('X-Cache', result.cache);
    if (result.unavailableSuppliers.length > 0) {
      res.set('X-Unavailable-Suppliers', result.unavailableSuppliers.join(','));
    }
    res.json(result.offers);
  };
}
