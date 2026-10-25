export type DeliveryPricing = {
  delivery_fee_mode: "fixed" | "distance";
  delivery_distance_step_km: number;
  delivery_distance_step_fee: number;
};

export function distanceDeliveryFee(meters: number, stepKm: number, stepFee: number) {
  if (!Number.isFinite(meters) || meters < 0 || !Number.isFinite(stepKm) || stepKm <= 0 || !Number.isSafeInteger(stepFee) || stepFee < 0) throw new Error("Invalid delivery pricing");
  const stepMeters = Math.round(stepKm * 1000);
  if (stepMeters < 1) throw new Error("Invalid delivery distance band");
  return Math.max(1, Math.ceil(Math.ceil(meters) / stepMeters)) * stepFee;
}

export function mapCoordinates(value: string): { latitude: number; longitude: number } | null {
  try {
    const url = new URL(value);
    const coordinate = url.searchParams.get("query") ?? url.searchParams.get("q") ?? url.searchParams.get("ll") ?? url.searchParams.get("destination");
    // Use the place pin before the map viewport center when both are present.
    const pin = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    const path = decodeURIComponent(url.pathname).replace(/\+/g, " ");
    const match = pin ?? coordinate?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
      ?? path.match(/\/maps\/(?:search|place)\/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:\/|$)/)
      ?? path.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const latitude = Number(match[1]), longitude = Number(match[2]);
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
  } catch { return null; }
}
