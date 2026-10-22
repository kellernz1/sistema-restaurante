import { Settings2 } from "lucide-react";

import { DashboardPlaceholder } from "@/features/auth/dashboard-placeholder";

export default function AdminDashboard() {
  return (
    <DashboardPlaceholder
      eyebrow="Administração"
      title="Configuração central"
      description="Gerencie os recursos operacionais e preferências do restaurante."
      icon={Settings2}
      nextStep="QR Codes e configurações serão adicionados nas Fases 8 e 9."
    />
  );
}
