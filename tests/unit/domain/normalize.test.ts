import { normalizeCity, normalizeHotelName } from '../../../src/domain/normalize';

describe('normalize', () => {
  it('lower-cases, trims and collapses whitespace in city names', () => {
    expect(normalizeCity('  New   Delhi ')).toBe('new delhi');
  });

  it('lower-cases, trims and collapses whitespace in hotel names', () => {
    expect(normalizeHotelName('  Lemon   Tree ')).toBe('lemon tree');
  });
});
