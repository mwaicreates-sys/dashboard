"use client";

import { ReactNode, InputHTMLAttributes, SelectHTMLAttributes } from "react";

// Shared form primitives for the data-entry drawer.
// Styled with the dashboard design tokens so the overlay feels native.

export const inputCls =
  "w-full rounded border border-border bg-white px-2 py-1 text-xs text-primary-text focus:outline-none focus:ring-1 focus:ring-blue";

export const labelCls =
  "mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text";

export const btnPrimary =
  "rounded border border-blue bg-blue px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50";

export const btnGhost =
  "rounded border border-border bg-card px-2 py-1 text-[11px] text-secondary-text hover:bg-light-border";

export const btnDanger =
  "rounded border border-red-300 bg-white px-2 py-1 text-[11px] text-red-600 hover:bg-red-50";

/** Green button for the direct "Pay" action on planned transactions. */
export const btnPaid =
  "rounded border border-green-600 bg-green-600 px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function SelectBox(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary-text">
      {children}
    </h3>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-3 text-center text-[11px] text-muted-text">{children}</p>
  );
}

export function CardList({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {children}
    </div>
  );
}

export function CardRow({
  title,
  subtitle,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-border bg-card px-2 py-1.5">
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium text-primary-text">{title}</div>
        {subtitle ? (
          <div className="truncate text-[10px] text-muted-text">{subtitle}</div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">{right}</div>
    </div>
  );
}

export function ActionButton({
  label,
  onClick,
  variant = "ghost",
}: {
  label: string;
  onClick: () => void;
  variant?: "ghost" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={variant === "danger" ? btnDanger : btnGhost}
    >
      {label}
    </button>
  );
}

// ------------------------------------------------------------
// Data table primitives for the dedicated data-entry page
// ------------------------------------------------------------

export function DataTable({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr className="border-b border-border bg-card">
            {columns.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap px-2 py-1.5 font-medium text-muted-text"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function DataRow({
  children,
  last = false,
}: {
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <tr
      className={`border-light-border ${last ? "" : "border-b"} hover:bg-card/60`}
    >
      {children}
    </tr>
  );
}

export function DataCell({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <td className={`whitespace-nowrap px-2 py-1.5 align-middle ${className}`}>
      {children}
    </td>
  );
}
