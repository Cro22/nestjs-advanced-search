/**
 * Real coordinates for the taxonomy cities. Products get a small jitter around
 * their city center so geo queries return believable, non identical points.
 * The nearest pair of cities (Lisbon and Porto) is about 270 km apart, so a
 * modest radius cleanly isolates a single city in demos and tests.
 */
export const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  Madrid: { lat: 40.4168, lon: -3.7038 },
  Barcelona: { lat: 41.3874, lon: 2.1686 },
  Valencia: { lat: 39.4699, lon: -0.3763 },
  Seville: { lat: 37.3891, lon: -5.9845 },
  Bilbao: { lat: 43.263, lon: -2.935 },
  Malaga: { lat: 36.7213, lon: -4.4214 },
  Zaragoza: { lat: 41.6488, lon: -0.8891 },
  Lisbon: { lat: 38.7223, lon: -9.1393 },
  Porto: { lat: 41.1579, lon: -8.6291 },
  Paris: { lat: 48.8566, lon: 2.3522 },
};

/** Roughly 5 km at these latitudes. */
const JITTER_DEGREES = 0.05;

/**
 * Coordinates near the given city center. rand must return values in [0, 1);
 * callers control determinism by supplying a seeded or hash derived source.
 */
export function jitteredCoordinates(
  city: string,
  rand: () => number,
): { lat: number; lon: number } {
  const center = CITY_COORDINATES[city];
  if (!center) {
    throw new Error(`Unknown city for coordinates: ${city}`);
  }
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return {
    lat: round(center.lat + (rand() * 2 - 1) * JITTER_DEGREES),
    lon: round(center.lon + (rand() * 2 - 1) * JITTER_DEGREES),
  };
}
