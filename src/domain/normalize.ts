export function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}

export function normalizeHotelName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
