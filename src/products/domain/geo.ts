/** A geographic coordinate pair in decimal degrees. */
export interface GeoPoint {
  lat: number;
  lon: number;
}

export const MIN_LATITUDE = -90;
export const MAX_LATITUDE = 90;
export const MIN_LONGITUDE = -180;
export const MAX_LONGITUDE = 180;

export function isValidGeoPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    point.lat >= MIN_LATITUDE &&
    point.lat <= MAX_LATITUDE &&
    point.lon >= MIN_LONGITUDE &&
    point.lon <= MAX_LONGITUDE
  );
}
