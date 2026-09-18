import { normalizeCity, normalizeHotelName } from '../../../src/domain/normalize';

describe('normalize', () => {
  it('lower-cases and trims city names', () => {
    expect(normalizeCity('  Delhi ')).toBe('delhi');
  });

  it('lower-cases, trims and collapses whitespace in hotel names', () => {
    expect(normalizeHotelName('  Lemon   Tree ')).toBe('lemon tree');
  });
});
