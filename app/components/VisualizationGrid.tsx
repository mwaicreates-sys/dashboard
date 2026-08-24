"use client";

import Link from "next/link";
import { MonthlyIncomeOutflow } from "./MonthlyIncomeOutflow";
import { IncomeSplit } from "./IncomeSplit";
import { OutflowTypes } from "./OutflowTypes";
import { CumulativeGrowth } from "./CumulativeGrowth";
import { SavingsGoal } from "./SavingsGoal";

const cardLink =
  "group block rounded border border-border bg-card p-2.5 cursor-pointer transition-colors hover:border-secondary-text/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue";

export function VisualizationGrid() {
  return (
      <div className="grid grid-cols-1 md:grid-cols-[28fr_18fr_18fr_18fr_18fr] gap-2.5">
      <Link
        href="/outflow"
        aria-label="Monthly Income vs Outflow — view outflow details"
        className={cardLink}
      >
        <MonthlyIncomeOutflow />
      </Link>
      <Link
        href="/income"
        aria-label="Income Split — view income details"
        className={cardLink}
      >
        <IncomeSplit />
      </Link>
      <Link
        href="/outflow"
        aria-label="Outflow Types — view outflow breakdown details"
        className={cardLink}
      >
        <OutflowTypes />
      </Link>
      <Link
        href="/growth"
        aria-label="Cumulative Growth — view growth details"
        className={cardLink}
      >
        <CumulativeGrowth />
      </Link>
      <Link
        href="/goals"
        aria-label="Savings Goal — view goals details"
        className={cardLink}
      >
        <SavingsGoal />
      </Link>
    </div>
  );
}
