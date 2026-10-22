import { LayoutGrid } from "lucide-react";

import { DashboardPlaceholder } from "@/features/auth/dashboard-placeholder";

export default function WaiterDashboard() {
  return (
    <DashboardPlaceholder
      eyebrow="Painel do garçom"
      title="Salão sob controle"
      description="Acompanhe mesas e pedidos em um só lugar durante todo o atendimento."
      icon={LayoutGrid}
      nextStep="O mapa de mesas será disponibilizado na Fase 4."
    />
  );
}
