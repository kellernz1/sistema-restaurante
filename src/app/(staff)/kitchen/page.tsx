import { CookingPot } from "lucide-react";

import { DashboardPlaceholder } from "@/features/auth/dashboard-placeholder";

export default function KitchenDashboard() {
  return (
    <DashboardPlaceholder
      eyebrow="Painel da cozinha"
      title="Produção organizada"
      description="Visualize a fila de preparo e mantenha o salão informado em tempo real."
      icon={CookingPot}
      nextStep="O painel de produção em tempo real será disponibilizado na Fase 6."
    />
  );
}
