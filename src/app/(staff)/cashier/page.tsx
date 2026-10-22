import { BadgeDollarSign } from "lucide-react";

import { DashboardPlaceholder } from "@/features/auth/dashboard-placeholder";

export default function CashierDashboard() {
  return (
    <DashboardPlaceholder
      eyebrow="Painel do caixa"
      title="Fechamentos sem atrito"
      description="Confira comandas, pagamentos e mesas aguardando fechamento."
      icon={BadgeDollarSign}
      nextStep="O fluxo de fechamento de contas será disponibilizado na Fase 7."
    />
  );
}
