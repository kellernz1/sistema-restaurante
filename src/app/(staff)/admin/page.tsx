import { ArrowLink, LineupCard } from "@/components/ui";
import { createClient } from "@/utils/supabase/server";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

async function loadSummary() {
  const db = await createClient();
  const [pending, preparing, ready] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending_confirmation"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "ready"),
  ]);
  // Business day in Sao Paulo (UTC-3). Read all pages rather than a capped total.
  const date = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = new Date(date + "T00:00:00-03:00");
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  let revenueCents = 0;
  let revenueError = false;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("orders").select("id, total_amount")
      .eq("status", "closed").eq("payment_status", "paid")
      .gte("closed_at", start.toISOString()).lt("closed_at", end.toISOString())
      .order("id").range(offset, offset + 999);
    if (error || !data) { revenueError = true; break; }
    revenueCents += data.reduce((sum, order) => sum + Math.round(order.total_amount * 100), 0);
    if (data.length < 1000) break;
  }
  return { pending, preparing, ready, revenueCents, revenueError };
}

export default async function AdminDashboard() {
  const { pending, preparing, ready, revenueCents, revenueError } = await loadSummary();
  const metrics = [
    { title: "Novos pedidos", description: "Prontos para sua confirmação.", value: pending.error ? "—" : pending.count ?? 0, tone: "blue", href: "/orders" },
    { title: "Em preparo", description: "O ritmo da sua cozinha, agora.", value: preparing.error ? "—" : preparing.count ?? 0, tone: "peach", href: "/orders" },
    { title: "Prontos", description: "Tudo pronto para o próximo passo.", value: ready.error ? "—" : ready.count ?? 0, tone: "green", href: "/orders" },
    { title: "Faturamento do dia", description: "Pedidos pagos e encerrados hoje.", value: revenueError ? "—" : money.format(revenueCents / 100), tone: "lavender", href: "/cashier" },
  ];
  return <section className="dashboard-lineup">
    <header className="section-heading"><div><span className="eyebrow">Visão geral</span><h1>Meu painel</h1><p>Seu restaurante. Em um olhar.</p></div><ArrowLink href="/orders">Ver todos os pedidos</ArrowLink></header>
    {(pending.error || preparing.error || ready.error || revenueError) && <p role="alert" className="table-notice table-notice-error">Alguns indicadores estão indisponíveis. Atualize a página para tentar novamente.</p>}
    <div className="lineup-grid dashboard-metrics">{metrics.map((metric) => <LineupCard key={metric.title} tone={metric.tone}
      visual={<span className={metric.title === "Faturamento do dia" ? "metric-number metric-money" : "metric-number"}>{metric.value}</span>}
      title={metric.title} description={metric.description} detail={metric.title === "Faturamento do dia" ? "Dia corrente · horário de Brasília" : "Pedidos ativos · todos os canais"}
      actions={<ArrowLink href={metric.href}>Ver</ArrowLink>} />)}</div>
    <nav className="dashboard-shortcuts" aria-label="Administração"><ArrowLink href="/admin/menu">Gerenciar cardápio</ArrowLink><ArrowLink href="/admin/tables/qr">QR codes das mesas</ArrowLink><ArrowLink href="/admin/settings">Configurações</ArrowLink></nav>
  </section>;
}
