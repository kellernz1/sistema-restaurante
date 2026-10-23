import Link from "next/link";

export default function AdminDashboard() {
  return <section className="table-detail-state"><span className="eyebrow">Administração</span><h1>Configuração central</h1><p>Gerencie o atendimento e os canais de pedido do restaurante.</p><div className="cashier-actions"><Link href="/admin/tables/qr" className="primary-button compact-button">QR codes das mesas</Link><Link href="/admin/settings" className="ghost-button">Configurações</Link><Link href="/orders" className="ghost-button">Central de pedidos</Link></div></section>;
}
