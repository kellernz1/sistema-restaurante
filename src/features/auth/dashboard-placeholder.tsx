"use client";

import { useTranslation } from "@/components/language-provider";
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
  const t = useTranslation();
  return (
    <section className="dashboard-placeholder">
      <div className="dashboard-copy">
        <span className="eyebrow">{t(eyebrow)}</span>
        <h1>{t(title)}</h1>
        <p>{t(description)}</p>
      </div>

      <div className="placeholder-card">
        <span className="placeholder-icon">
          <Icon aria-hidden="true" size={28} />
        </span>
        <div>
          <strong>{t("Área preparada")}</strong>
          <p>{t(nextStep)}</p>
        </div>
        <span className="status-pill">{t("Em breve")}</span>
      </div>
    </section>
  );
}
