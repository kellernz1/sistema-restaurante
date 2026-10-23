import Link from "next/link";

export default function AdminDashboard() {
  return <section className="table-detail-state"><span className="eyebrow">Administração</span><h1>Configuração central</h1><p>Gerencie os códigos de acesso ao cardápio de cada mesa.</p><Link href="/admin/tables/qr" className="primary-button compact-button">QR codes das mesas</Link></section>;
}
