import type { LucideIcon } from "lucide-react";

type DashboardPlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  nextStep: string;
};

export function DashboardPlaceholder({
  eyebrow,
  title,
  description,
  icon: Icon,
  nextStep,
}: DashboardPlaceholderProps) {
  return (
    <section className="dashboard-placeholder">
      <div className="dashboard-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className="placeholder-card">
        <span className="placeholder-icon">
          <Icon aria-hidden="true" size={28} />
        </span>
        <div>
          <strong>Área preparada</strong>
          <p>{nextStep}</p>
        </div>
        <span className="status-pill">Em breve</span>
      </div>
    </section>
  );
}
