import { StaticSupplierCatalog } from '../../../src/suppliers/supplier.catalog';

describe('StaticSupplierCatalog', () => {
  const catalog = new StaticSupplierCatalog();

  it('returns every hotel of a supplier when no city is given', () => {
    expect(catalog.listHotels('supplierA').length).toBeGreaterThan(0);
  });

  it('filters by city case-insensitively', () => {
    const hotels = catalog.listHotels('supplierB', ' DELHI ');

    expect(hotels.length).toBeGreaterThan(0);
    expect(hotels.every((hotel) => hotel.city === 'delhi')).toBe(true);
  });

  it('returns an empty list for an unknown city', () => {
    expect(catalog.listHotels('supplierA', 'paris')).toEqual([]);
  });

  it('shares overlapping hotel names between suppliers for delhi and mumbai', () => {
    for (const city of ['delhi', 'mumbai']) {
      const namesA = new Set(catalog.listHotels('supplierA', city).map((hotel) => hotel.name));
      const overlap = catalog
        .listHotels('supplierB', city)
        .filter((hotel) => namesA.has(hotel.name));
      expect(overlap.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('exposes immutable data', () => {
    const hotels = catalog.listHotels('supplierA');

    expect(Object.isFrozen(hotels)).toBe(true);
    expect(Object.isFrozen(hotels[0])).toBe(true);
  });
});
