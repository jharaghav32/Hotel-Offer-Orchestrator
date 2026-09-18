import type { HotelOffer, SupplierHotel, SupplierHotelList } from './hotel';
import { normalizeHotelName } from './normalize';
import { SUPPLIER_NAMES, type SupplierId } from './supplier';

interface Candidate {
  supplierId: SupplierId;
  hotel: SupplierHotel;
}

function isBetter(challenger: Candidate, incumbent: Candidate): boolean {
  if (challenger.hotel.price !== incumbent.hotel.price) {
    return challenger.hotel.price < incumbent.hotel.price;
  }
  return challenger.hotel.commissionPct > incumbent.hotel.commissionPct;
}

function toOffer({ supplierId, hotel }: Candidate): HotelOffer {
  return {
    name: hotel.name.trim(),
    price: hotel.price,
    supplier: SUPPLIER_NAMES[supplierId],
    commissionPct: hotel.commissionPct,
  };
}

function compareOffers(a: HotelOffer, b: HotelOffer): number {
  return a.price - b.price || a.name.localeCompare(b.name);
}

export function selectBestOffers(lists: readonly SupplierHotelList[]): HotelOffer[] {
  const winners = new Map<string, Candidate>();

  for (const { supplierId, hotels } of lists) {
    for (const hotel of hotels) {
      const key = normalizeHotelName(hotel.name);
      const candidate: Candidate = { supplierId, hotel };
      const incumbent = winners.get(key);

      if (!incumbent || isBetter(candidate, incumbent)) {
        winners.set(key, candidate);
      }
    }
  }

  return Array.from(winners.values(), toOffer).sort(compareOffers);
}
