import { money } from "./menu-cart";

export function DeliveryQuoteSummary({ quote, pending, error, refresh }: {
  quote: { fee: number; distance_meters: number | null } | null; pending: boolean; error: string; refresh: () => void;
}) {
  return <section className="delivery-location-picker" aria-label="Cálculo da entrega"><h3>Entrega por distância</h3>
    {pending ? <p role="status">Calculando a rota pelas ruas...</p> : quote ? <p role="status">{quote.distance_meters !== null ? `${(quote.distance_meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} km pela rota · ` : ""}Entrega: <strong>{money.format(quote.fee)}</strong></p> : <p>Envie sua localização pelo GPS ou por um link com o ponto no mapa para calcular a taxa antes de finalizar.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}<button type="button" className="ghost-button" disabled={pending} onClick={refresh}>Recalcular entrega</button>
  </section>;
}
