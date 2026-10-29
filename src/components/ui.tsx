import Link from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function PillButton({ className = "", type = "button", variant = "primary", operational = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; operational?: boolean }) {
  return <button type={type} className={`primary-button pill-button ui-button ui-button-${variant}${operational ? " ui-button-operational" : ""} ${className}`} {...props} />;
}

export function ArrowLink({ children, href, className = "" }: { children: ReactNode; href: string; className?: string }) {
  return <Link className={`arrow-link ui-link ${className}`} href={href}>{children}<span aria-hidden="true">›</span></Link>;
}

export function ArrowButton({ children, className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`ghost-button arrow-link ui-link ${className}`} {...props}>{children}<span aria-hidden="true">›</span></button>;
}

export function StatusPill({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={`status-pill ui-status ui-status-${tone} ${className}`}>{children}</span>;
}

export function LineupCard({ visual, title, description, detail, actions, tone = "blue", className = "" }: {
  visual: ReactNode; title: ReactNode; description?: ReactNode; detail?: ReactNode;
  actions?: ReactNode; tone?: string; className?: string;
}) {
  return <article className={`lineup-card lineup-${tone} ${className}`}>
    <div className="lineup-visual">{visual}</div>
    <div className="lineup-copy"><h3>{title}</h3>{description && <p className="lineup-description">{description}</p>}
      {detail && <p className="lineup-detail">{detail}</p>}{actions && <div className="lineup-actions">{actions}</div>}</div>
  </article>;
}

export function SegmentedControl({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string; count: number }[];
  onChange: (value: string) => void;
}) {
  return <div className="segmented-control ui-segmented" role="group" aria-label={label}>{options.map((option) =>
    <button type="button" key={option.value} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      {option.label}<span className="segment-count">{option.count}</span>
    </button>)}</div>;
}

// Callers translate visible content with getTranslation or useTranslation.
// These presenters work in either module graph without a global client provider.
export function Panel({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`ui-panel ${className}`} {...props} />;
}

export function SectionTitle({ title, description, actions, level = 2 }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; level?: 1 | 2 | 3 }) {
  const Heading = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  return <header className="ui-section-title"><div><Heading>{title}</Heading>{description && <p>{description}</p>}</div>{actions}</header>;
}

export function FormField({ id, label, help, error, className = "", ...input }: InputHTMLAttributes<HTMLInputElement> & { id: string; label: ReactNode; help?: ReactNode; error?: ReactNode }) {
  const describedBy = [input["aria-describedby"], help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return <div className={`ui-field ${className}`}><label htmlFor={id}>{label}</label><input {...input} id={id} name={input.name ?? id} aria-invalid={error ? true : input["aria-invalid"]} aria-describedby={describedBy} />{help && <small id={`${id}-help`}>{help}</small>}{error && <p id={`${id}-error`} role="alert">{error}</p>}</div>;
}

export function Notice({ children, tone = "info", urgent = false, className = "" }: { children: ReactNode; tone?: "info" | "success" | "warning" | "danger"; urgent?: boolean; className?: string }) {
  return <div className={`ui-notice ui-tone-${tone} ${className}`} role={urgent ? "alert" : "status"}>{children}</div>;
}

export function Toast({ children, onDismiss, dismissLabel }: { children: ReactNode; onDismiss?: () => void; dismissLabel: string }) {
  return <div className="ui-toast"><div role="status" aria-atomic="true">{children}</div>{onDismiss && <button type="button" className="ui-dismiss" aria-label={dismissLabel} onClick={onDismiss}>×</button>}</div>;
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return <section className="ui-state"><h3>{title}</h3>{children && <p>{children}</p>}{action}</section>;
}

export function LoadingState({ children }: { children: ReactNode }) {
  return <p className="ui-state" role="status" aria-live="polite">{children}</p>;
}

export function ErrorState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <section className="ui-state ui-tone-danger"><p role="alert">{children}</p>{action}</section>;
}
