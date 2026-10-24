import { z } from "zod";

export const mapLinkSchema = z.string().trim().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const host = url.hostname;
    return host === "maps.app.goo.gl" || host === "maps.apple.com"
      || ((host === "www.google.com" || host === "google.com" || host === "www.google.com.br" || host === "google.com.br") && url.pathname.startsWith("/maps"))
      || host === "maps.google.com" || host === "maps.google.com.br"
      || (host === "goo.gl" && url.pathname.startsWith("/maps/"))
      || host === "waze.com" || host === "www.waze.com" || host === "ul.waze.com";
  } catch { return false; }
}, "Cole um link HTTPS do Google Maps, Apple Mapas ou Waze.");

export function coordinatesMapLink(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("Localização inválida.");
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}
