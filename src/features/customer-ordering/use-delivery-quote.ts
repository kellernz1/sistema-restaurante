"use client";

import { useCallback, useEffect, useState } from "react";
import { mapLinkSchema } from "./delivery-location";
import { customerApi } from "./public-client";

type Quote = { id: string | null; fee: number; distance_meters: number | null; expires_at: string | null };
export function useDeliveryQuote(location: string, enabled: boolean, pricingKey = "") {
  const [result, setResult] = useState<{ location: string; quote: Quote; revision: number; pricingKey: string } | null>(null);
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const requestKey = JSON.stringify([location, revision, pricingKey]);
  useEffect(() => {
    if (!enabled || !mapLinkSchema.safeParse(location).success) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPendingKey(requestKey); setError(""); setResult(null);
      try {
        const quote = await customerApi<Quote>("/api/public/delivery-quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ location_url: location }), signal: controller.signal });
        if (!controller.signal.aborted) setResult({ location, quote, revision, pricingKey });
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Não foi possível calcular a entrega.");
      } finally { if (!controller.signal.aborted) setPendingKey(null); }
    }, 500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [location, enabled, revision, pricingKey, requestKey]);
  useEffect(() => {
    if (!result?.quote.expires_at) return;
    const timer = setTimeout(refresh, Math.max(0, Date.parse(result.quote.expires_at) - Date.now() - 30000));
    return () => clearTimeout(timer);
  }, [result, refresh]);
  useEffect(() => {
    const checkExpiration = () => { if (result?.quote.expires_at && Date.parse(result.quote.expires_at) <= Date.now() + 30000) refresh(); };
    window.addEventListener("focus", checkExpiration);
    return () => window.removeEventListener("focus", checkExpiration);
  }, [result, refresh]);
  const quote = enabled && result?.location === location && result.revision === revision && result.pricingKey === pricingKey ? result.quote : null;
  return { quote, error: enabled ? error : "", pending: enabled && pendingKey === requestKey, refresh };
}
