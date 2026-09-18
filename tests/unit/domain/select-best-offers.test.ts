import type { SupplierHotel } from '../../../src/domain/hotel';
import { selectBestOffers } from '../../../src/domain/select-best-offers';

const hotel = (
  overrides: Partial<SupplierHotel> & Pick<SupplierHotel, 'name' | 'price'>,
): SupplierHotel => ({
  hotelId: overrides.name,
  city: 'delhi',
  commissionPct: 10,
  ...overrides,
});

describe('selectBestOffers', () => {
  it('keeps the cheaper offer when both suppliers list the same hotel', () => {
    const offers = selectBestOffers([
      {
        supplierId: 'supplierA',
        hotels: [hotel({ name: 'Holtin', price: 6000, commissionPct: 10 })],
      },
      {
        supplierId: 'supplierB',
        hotels: [hotel({ name: 'Holtin', price: 5340, commissionPct: 20 })],
      },
    ]);

    expect(offers).toEqual([
      { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
    ]);
  });

  it('keeps the first supplier when it is the cheaper one', () => {
    const offers = selectBestOffers([
      {
        supplierId: 'supplierA',
        hotels: [hotel({ name: 'Radison', price: 5900, commissionPct: 13 })],
      },
      {
        supplierId: 'supplierB',
        hotels: [hotel({ name: 'Radison', price: 6200, commissionPct: 18 })],
      },
    ]);

    expect(offers).toEqual([
      { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
    ]);
  });

  it('keeps hotels offered by only one supplier', () => {
    const offers = selectBestOffers([
      { supplierId: 'supplierA', hotels: [hotel({ name: 'Taj Palace', price: 9000 })] },
      { supplierId: 'supplierB', hotels: [hotel({ name: 'Oberoi', price: 8000 })] },
    ]);

    expect(offers.map(({ name, supplier }) => [name, supplier])).toEqual([
      ['Oberoi', 'Supplier B'],
      ['Taj Palace', 'Supplier A'],
    ]);
  });

  it('breaks price ties by the higher commission', () => {
    const offers = selectBestOffers([
      {
        supplierId: 'supplierA',
        hotels: [hotel({ name: 'Trident', price: 8200, commissionPct: 10 })],
      },
      {
        supplierId: 'supplierB',
        hotels: [hotel({ name: 'Trident', price: 8200, commissionPct: 14 })],
      },
    ]);

    expect(offers[0]).toMatchObject({ supplier: 'Supplier B', commissionPct: 14 });
  });

  it('keeps the earlier supplier when price and commission are identical', () => {
    const offers = selectBestOffers([
      { supplierId: 'supplierA', hotels: [hotel({ name: 'Ibis', price: 3100, commissionPct: 9 })] },
      { supplierId: 'supplierB', hotels: [hotel({ name: 'Ibis', price: 3100, commissionPct: 9 })] },
    ]);

    expect(offers[0]?.supplier).toBe('Supplier A');
  });

  it('matches hotel names regardless of case and surrounding whitespace', () => {
    const offers = selectBestOffers([
      { supplierId: 'supplierA', hotels: [hotel({ name: '  Lemon   Tree ', price: 3200 })] },
      { supplierId: 'supplierB', hotels: [hotel({ name: 'lemon tree', price: 3500 })] },
    ]);

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ name: 'Lemon   Tree', price: 3200, supplier: 'Supplier A' });
  });

  it('returns offers sorted by price, then by name', () => {
    const offers = selectBestOffers([
      {
        supplierId: 'supplierA',
        hotels: [
          hotel({ name: 'Zeta', price: 5000 }),
          hotel({ name: 'Alpha', price: 5000 }),
          hotel({ name: 'Cheap', price: 1000 }),
        ],
      },
    ]);

    expect(offers.map((offer) => offer.name)).toEqual(['Cheap', 'Alpha', 'Zeta']);
  });

  it('returns an empty list when no supplier has hotels', () => {
    expect(selectBestOffers([])).toEqual([]);
    expect(selectBestOffers([{ supplierId: 'supplierA', hotels: [] }])).toEqual([]);
  });
});
