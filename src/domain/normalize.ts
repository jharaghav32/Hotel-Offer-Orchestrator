export function normalizeCity(city: string): string {
  return city.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeHotelName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
