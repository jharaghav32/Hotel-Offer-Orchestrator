import { z } from 'zod';
import { normalizeCity } from '../domain/normalize';

const CITY_PATTERN = /^[a-z]+(?:[ -][a-z]+)*$/;
const PRICE_PATTERN = /^\d+(?:\.\d+)?$/;

const requiredString = (field: string) =>
  z.string({
    error: (issue) =>
      issue.input === undefined ? `${field} is required` : `${field} must be a single value`,
  });

const city = requiredString('city')
  .transform(normalizeCity)
  .pipe(
    z
      .string()
      .min(1, { error: 'city is required', abort: true })
      .max(50, 'city must be at most 50 characters')
      .regex(CITY_PATTERN, 'city must contain only letters, spaces or hyphens'),
  );

const price = (field: string) =>
  requiredString(field)
    .trim()
    .regex(PRICE_PATTERN, `${field} must be a non-negative number`)
    .transform(Number)
    .optional();

export const hotelSearchQuerySchema = z
  .object({
    city,
    minPrice: price('minPrice'),
    maxPrice: price('maxPrice'),
  })
  .refine(
    ({ minPrice, maxPrice }) =>
      minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
    { path: ['maxPrice'], message: 'maxPrice must be greater than or equal to minPrice' },
  );

export type HotelSearchQuery = z.output<typeof hotelSearchQuerySchema>;
