"use client";

import Link from "next/link";
import { useState } from "react";
import { TransactionsSection } from "@/components/data-entry/TransactionsSection";
import { AccountsSection } from "@/components/data-entry/AccountsSection";
import { CategoriesSection } from "@/components/data-entry/CategoriesSection";
import { BudgetsSection } from "@/components/data-entry/BudgetsSection";
import { GoalsSection } from "@/components/data-entry/GoalsSection";
import { PlannedTransactionsSection } from "@/components/data-entry/PlannedTransactionsSection";

type TabId = "transactions" | "accounts" | "categories" | "budgets" | "goals" | "planned";

const TABS: { id: TabId; label: string }[] = [
  { id: "transactions", label: "Transactions" },
  { id: "accounts", label: "Accounts" },
  { id: "categories", label: "Categories" },
  { id: "budgets", label: "Budgets" },
  { id: "goals", label: "Goals" },
  { id: "planned", label: "Planned Transactions" },
];

export default function DataEntryPage() {
  const [tab, setTab] = useState<TabId>("transactions");

  return (
    <main className="flex-1 p-3 md:p-4">
      <div className="mx-auto max-w-[1200px] rounded border border-border bg-white p-3 md:p-4 shadow-sm">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-primary-text leading-tight">
              Data Entry
            </h1>
            <p className="mt-0.5 text-[11px] text-secondary-text">
              Manage your financial information
            </p>
          </div>
          <Link
            href="/"
            className="rounded border border-border bg-card px-2 py-1 text-[11px] text-secondary-text hover:bg-light-border"
          >
            ← Annual Dashboard
          </Link>
        </div>

        <div className="mt-3 h-px bg-border" />

        {/* Tabs */}
        <div className="mt-3 flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded border px-2.5 py-1 text-[11px] ${
                tab === t.id
                  ? "border-blue bg-blue text-white"
                  : "border-border bg-card text-secondary-text hover:bg-light-border"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Active section */}
        <div className="mt-3">
          {tab === "transactions" ? <TransactionsSection /> : null}
          {tab === "accounts" ? <AccountsSection /> : null}
          {tab === "categories" ? <CategoriesSection /> : null}
          {tab === "budgets" ? <BudgetsSection /> : null}
          {tab === "goals" ? <GoalsSection /> : null}
          {tab === "planned" ? <PlannedTransactionsSection /> : null}
        </div>
      </div>
    </main>
  );
}