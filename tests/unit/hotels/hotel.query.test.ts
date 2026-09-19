import { parseInput } from '../../../src/api/validation';
import { hotelSearchQuerySchema } from '../../../src/hotels/hotel.query';
import { ValidationError } from '../../../src/shared/errors';

const parse = (query: Record<string, unknown>) => parseInput(hotelSearchQuerySchema, query);

const messageOf = (query: Record<string, unknown>): string => {
  try {
    parse(query);
  } catch (error) {
    if (error instanceof ValidationError) {
      return error.message;
    }
    throw error;
  }
  throw new Error('expected validation to fail');
};

describe('hotelSearchQuerySchema', () => {
  it('normalises the city and converts prices to numbers', () => {
    expect(parse({ city: '  New   Delhi ', minPrice: '5000', maxPrice: '7000.5' })).toEqual({
      city: 'new delhi',
      minPrice: 5000,
      maxPrice: 7000.5,
    });
  });

  it('treats price bounds as optional', () => {
    expect(parse({ city: 'delhi' })).toEqual({ city: 'delhi' });
    expect(parse({ city: 'delhi', minPrice: '0' })).toEqual({ city: 'delhi', minPrice: 0 });
  });

  it('accepts equal bounds', () => {
    expect(parse({ city: 'delhi', minPrice: '5340', maxPrice: '5340' })).toMatchObject({
      minPrice: 5340,
      maxPrice: 5340,
    });
  });

  it('ignores unknown parameters', () => {
    expect(parse({ city: 'delhi', sort: 'desc' })).toEqual({ city: 'delhi' });
  });

  it.each([
    [{}, 'city: city is required'],
    [{ city: '   ' }, 'city: city is required'],
    [{ city: 'de$lhi' }, 'city: city must contain only letters, spaces or hyphens'],
    [{ city: 'delhi:prices' }, 'city: city must contain only letters, spaces or hyphens'],
    [{ city: 'a'.repeat(51) }, 'city: city must be at most 50 characters'],
    [{ city: ['delhi', 'goa'] }, 'city: city must be a single value'],
    [{ city: 'delhi', minPrice: 'abc' }, 'minPrice: minPrice must be a non-negative number'],
    [{ city: 'delhi', minPrice: '-5' }, 'minPrice: minPrice must be a non-negative number'],
    [{ city: 'delhi', minPrice: '' }, 'minPrice: minPrice must be a non-negative number'],
    [{ city: 'delhi', maxPrice: '1e3' }, 'maxPrice: maxPrice must be a non-negative number'],
    [
      { city: 'delhi', minPrice: '7000', maxPrice: '5000' },
      'maxPrice: maxPrice must be greater than or equal to minPrice',
    ],
  ])('rejects %j', (query, message) => {
    expect(messageOf(query)).toBe(message);
  });
});
