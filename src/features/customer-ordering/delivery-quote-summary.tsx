"use client";

import { useTranslation } from "@/components/language-provider";
import { money } from "./menu-cart";

export function DeliveryQuoteSummary({ quote, pending, error, refresh }: {
  quote: { fee: number; distance_meters: number | null } | null; pending: boolean; error: string; refresh: () => void;
}) {
  const t = useTranslation();
  return <section className="delivery-location-picker" aria-label={t("Cálculo da entrega")}><h3>{t("Entrega por distância")}</h3>
    {pending ? <p role="status">{t("Calculando a rota pelas ruas...")}</p> : quote ? <p role="status">{t(quote.distance_meters !== null ? t(`${(quote.distance_meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} km pela rota · `) : "")}{t("Entrega: ")}<strong>{t(money.format(quote.fee))}</strong></p> : <p>{t("Envie sua localização pelo GPS ou por um link com o ponto no mapa para calcular a taxa antes de finalizar.")}</p>}
    {error && <p className="form-error" role="alert">{t(error)}</p>}<button type="button" className="ghost-button" disabled={pending} onClick={refresh}>{t("Recalcular entrega")}</button>
  </section>;
}
