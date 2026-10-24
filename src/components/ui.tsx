"use client";

import { useTranslation } from "@/components/language-provider";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function PillButton({ className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`primary-button pill-button ${className}`} {...props} />;
}

export function ArrowLink({ children, href, className = "" }: { children: ReactNode; href: string; className?: string }) {
  const t = useTranslation();
  return <Link className={`arrow-link ${className}`} href={href}>{t(children)}<span aria-hidden="true">›</span></Link>;
}

export function ArrowButton({ children, className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const t = useTranslation();
  return <button type={type} className={`ghost-button arrow-link ${className}`} {...props}>{t(children)}<span aria-hidden="true">›</span></button>;
}

export function StatusPill({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: string; className?: string }) {
  const t = useTranslation();
  return <span className={`status-pill ui-status ui-status-${tone} ${className}`}>{t(children)}</span>;
}

export function LineupCard({ visual, title, description, detail, actions, tone = "blue", className = "" }: {
  visual: ReactNode; title: ReactNode; description?: ReactNode; detail?: ReactNode;
  actions?: ReactNode; tone?: string; className?: string;
}) {
  const t = useTranslation();
  return <article className={`lineup-card lineup-${tone} ${className}`}>
    <div className="lineup-visual">{t(visual)}</div>
    <div className="lineup-copy"><h3>{title}</h3>{description && <p className="lineup-description">{description}</p>}
      {detail && <p className="lineup-detail">{t(detail)}</p>}{actions && <div className="lineup-actions">{t(actions)}</div>}</div>
  </article>;
}

export function SegmentedControl({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string; count: number }[];
  onChange: (value: string) => void;
}) {
  const t = useTranslation();
  return <div className="segmented-control" role="group" aria-label={t(label)}>{options.map((option) =>
    <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      {t(option.label)}<span className="segment-count">{option.count}</span>
    </button>)}</div>;
}
