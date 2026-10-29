import type { NavigationModes, NavigationGroup, Destination } from "./navigation";
const destination = (id: string, label: string, href: string): Destination => ({ id, label, href });
export function administrationGroups(modes: NavigationModes | null): NavigationGroup[] {
  return [
    { label: "Visão geral", destinations: [destination("overview", "Meu painel", "/admin")] },
    { label: "Cardápio e atendimento", destinations: [destination("menu", "Cardápio", "/admin/menu"), ...(modes?.dine_in_qr_enabled ? [destination("codes", "QR codes", "/admin/tables/qr")] : []), destination("service", "Atendimento", "/admin/settings#settings-operations"), destination("counter-settings", "Balcão e dia comercial", "/admin/settings#settings-counter")] },
    { label: "Dinheiro e pagamentos", destinations: [destination("reports", "Relatórios", "/admin/reports"), destination("sessions", "Sessões de caixa", "/cashier/sessions"), destination("payments", "Pagamentos e câmbio", "/admin/settings#settings-payments")] },
    { label: "Pessoas e segurança", destinations: [destination("employees", "Funcionários", "/admin/settings/employees"), destination("security", "Segurança e aprovações", "/admin/settings/security"), destination("approvals", "Aprovações", "/supervisor"), destination("audit", "Auditoria", "/admin/audit")] },
    { label: "Restaurante e entrega", destinations: [destination("delivery", "Entrega e taxas", "/admin/settings#settings-delivery"), destination("location", "Localização", "/admin/settings#settings-location"), destination("whatsapp", "WhatsApp", "/admin/settings#settings-whatsapp")] },
    { label: "Instalação e suporte", destinations: [destination("printing", "Impressão", "/admin/settings#settings-printing"), destination("backup", "Backup e serviços locais", "/admin/settings#settings-backup"), destination("license", "Licença", "/admin/settings/license")] },
  ];
}
