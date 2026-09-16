"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import {
  formatMoneyFull,
  todayISO,
  getWeekRange,
  weekRangeLabel,
  shortDayLabel,
} from "@/lib/dates";
import { DownloadIcon, PrintIcon } from "./icons";
import { isRealized } from "@/lib/calculations";
import { rowsToCsv } from "@/lib/csv";

type RangeId = "day" | "week" | "month" | "year";

const RANGES: Array<{ id: RangeId; label: string }> = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

/** Export & reports — real data only. CSV download + print-friendly report. */
export function ExportReports() {
  const { displayTransactions, activities, selectedYear, currency } = useDashboardData();

  const [range, setRange] = useState<RangeId>("month");
  const today = todayISO();
  const currentMonth = `${today.slice(0, 4)}-${today.slice(5, 7)}`;
  const [monthKey, setMonthKey] = useState(
    currentMonth.startsWith(String(selectedYear)) ? currentMonth : `${selectedYear}-01`
  );
  const [dayKey, setDayKey] = useState(today);

  const report = useMemo(() => {
    if (range === "day") {
      return {
        title: `Daily report · ${shortDayLabel(dayKey)}`,
        transactions: displayTransactions.filter((t) => t.date === dayKey),
        activities: activities.filter((a) => a.date === dayKey),
      };
    }
    if (range === "week") {
      const { start, end } = getWeekRange(dayKey);
      return {
        title: `Weekly report · ${weekRangeLabel(start, end)}`,
        transactions: displayTransactions.filter((t) => t.date >= start && t.date <= end),
        activities: activities.filter((a) => a.date >= start && a.date <= end),
      };
    }
    if (range === "month") {
      return {
        title: `Monthly report · ${monthKey}`,
        transactions: displayTransactions.filter((t) => t.date.startsWith(monthKey)),
        activities: activities.filter((a) => a.date.startsWith(monthKey)),
      };
    }
    return {
      title: `Annual report · ${selectedYear}`,
      transactions: displayTransactions.filter((t) => t.date.startsWith(String(selectedYear))),
      activities: activities.filter((a) => a.date.startsWith(String(selectedYear))),
    };
  }, [range, dayKey, monthKey, displayTransactions, activities, selectedYear]);

  // Phase 2 fixes: pending transactions excluded ("not counted yet",
  // isRealized) and transfers excluded from outflow — matching
  // calculations.ts's rule exactly so exported/printed totals always tie
  // out to the dashboard's totals for the same period. The raw transaction
  // list below (CSV rows, print table) is unaffected — pending entries
  // still appear there with their status column visible; only these
  // aggregate summary figures are filtered.
  const income = report.transactions.filter((t) => t.type === "income" && isRealized(t)).reduce((s, t) => s + t.amount, 0);
  const outflow = report.transactions
    .filter((t) => t.type === "expense" && isRealized(t))
    .reduce((s, t) => s + t.amount, 0);

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-primary-text">Export &amp; reports</h2>
          <p className="mt-0.5 text-[11px] text-muted-text">{report.title}</p>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as RangeId)}
          aria-label="Report range"
          className="h-8 rounded-lg border border-border bg-card px-2 text-xs font-medium text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60"
        >
          {RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {(range === "day" || range === "week") && (
        <label className="mb-2 block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">
            {range === "day" ? "Pick day" : "Any date in the week"}
          </span>
          <input
            type="date"
            value={dayKey}
            onChange={(e) => setDayKey(e.target.value || today)}
            aria-label={range === "day" ? "Report day" : "Report week"}
            className="h-9 w-full rounded-xl border border-border bg-card px-3 text-xs text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60 sm:max-w-52"
          />
        </label>
      )}

      {range === "month" && (
        <label className="mb-2 block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Month</span>
          <select
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
            aria-label="Report month"
            className="h-9 w-full rounded-xl border border-border bg-card px-3 text-xs text-primary-text outline-none focus-visible:ring-2 focus-visible:ring-blue/60 sm:max-w-52"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={`${selectedYear}-${String(i + 1).padStart(2, "0")}`}>
                {new Date(selectedYear, i, 1).toLocaleString("en", { month: "long" })} {selectedYear}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Live preview of what will be exported */}
      <div className="mb-3 grid grid-cols-4 divide-x divide-light-border rounded-xl border border-border bg-card/40 py-2">
        <Prev label="Income" value={formatMoneyFull(income)} cls="text-green" />
        <Prev label="Outflow" value={formatMoneyFull(outflow)} cls="text-orange" />
        <Prev label="Net" value={formatMoneyFull(income - outflow)} cls={income - outflow >= 0 ? "text-green" : "text-orange"} />
        <Prev label="Entries" value={String(report.transactions.length)} cls="text-primary-text" />
      </div>

      <ExportButtons
        report={report}
        income={income}
        outflow={outflow}
        range={range}
        dayKey={dayKey}
        monthKey={monthKey}
        year={selectedYear}
        today={today}
        disabled={report.transactions.length === 0 && report.activities.length === 0}
      />

      <p className="mt-2.5 text-[9px] text-muted-text">{currency} · real recorded data only</p>
    </section>
  );
}

function Prev({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="px-2 text-center">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-text">{label}</p>
      <p className={`mt-0.5 text-[11px] font-semibold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}

type Rep = {
  title: string;
  transactions: ReturnType<typeof useDashboardData>["transactions"];
  activities: ReturnType<typeof useDashboardData>["activities"];
};

function ExportButtons({
  report,
  income,
  outflow,
  range,
  dayKey,
  monthKey,
  year,
  today,
  disabled,
}: {
  report: Rep;
  income: number;
  outflow: number;
  range: RangeId;
  dayKey: string;
  monthKey: string;
  year: number;
  today: string;
  disabled: boolean;
}) {
  const { categories, currency } = useDashboardData();
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const suffix = range === "day" || range === "week" ? dayKey : range === "month" ? monthKey : String(year);

  const downloadCsv = () => {
    const rows: Array<Array<string | number>> = [
      ["Date", "Description", "Category", "Type", "Status", "Amount"],
    ];
    for (const tx of [...report.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push([
        tx.date,
        tx.description,
        catName(tx.categoryId),
        tx.type,
        tx.status,
        ((tx.type === "expense" || tx.type === "transfer" ? -tx.amount : tx.amount)).toFixed(2),
      ]);
    }
    for (const a of [...report.activities].sort((x, y) => x.date.localeCompare(y.date))) {
      rows.push([a.date, `Activity: ${a.title}`, "—", a.status, "—", ""]);
    }
    rows.push([]);
    rows.push(["", "", "", "", "Income", income.toFixed(2)]);
    rows.push(["", "", "", "", "Outflow", (-outflow).toFixed(2)]);
    rows.push(["", "", "", "", "Currency", currency]);
    rows.push(["", "", "", "", "Net", (income - outflow).toFixed(2)]);

    const csv = rowsToCsv(rows);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budget-${range}-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={downloadCsv}
        disabled={disabled}
        className="flex h-9 items-center gap-1.5 rounded-xl bg-blue px-3.5 text-xs font-medium text-white transition-colors hover:bg-blue/90 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue/60"
      >
        <DownloadIcon className="h-3.5 w-3.5" /> Download CSV
      </button>
      <button
        type="button"
        onClick={() => openPrintReport(report, income, outflow, catName, today, currency)}
        disabled={disabled}
        className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 text-xs font-medium text-secondary-text transition-colors hover:bg-surface hover:text-primary-text disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue/60"
      >
        <PrintIcon className="h-3.5 w-3.5" /> Print / PDF
      </button>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function openPrintReport(
  report: Rep,
  income: number,
  outflow: number,
  catName: (id: string) => string,
  today: string,
  currency: string
) {
  const win = window.open("", "_blank", "width=820,height=920");
  if (!win) return;

  // "Spending by category" mirrors the dashboard's Outflow Types/Top
  // Spendings breakdown (expense-only, realized-only) — Phase 2 fix, was
  // previously also counting transfers and pending transactions as spend.
  const byCategory = new Map<string, number>();
  for (const tx of report.transactions) {
    if (tx.type !== "expense" || !isRealized(tx)) continue;
    byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) ?? 0) + tx.amount);
  }
  const catRows = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, amt]) => `<tr><td>${escapeHtml(catName(id))}</td><td class="num neg">− ${formatMoneyFull(amt)}</td></tr>`)
    .join("");

  const txRows = [...report.transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (tx) => `<tr>
        <td>${tx.date}</td>
        <td>${escapeHtml(tx.description)}${tx.notes ? ` <small>${escapeHtml(tx.notes)}</small>` : ""}</td>
        <td>${escapeHtml(catName(tx.categoryId))}</td>
        <td class="${tx.type === "income" ? "pos" : tx.type === "expense" ? "neg" : ""}">${
          tx.type === "income" ? "+" : tx.type === "expense" ? "−" : ""
        } ${formatMoneyFull(tx.amount)}</td>
      </tr>`
    )
    .join("");

  const actList = report.activities.length
    ? `<h2>Activities</h2><ul>${report.activities
        .map((a) => `<li>${a.status === "completed" ? "✓" : "○"} ${escapeHtml(a.title)} <small>(${a.date})</small></li>`)
        .join("")}</ul>`
    : "";

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d1d1f;margin:40px;}
  h1{font-size:22px;margin:0 0 4px;} h2{font-size:14px;margin:24px 0 8px;color:#555;}
  .meta{color:#888;font-size:12px;margin-bottom:16px;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  th{text-align:left;border-bottom:1px solid #ddd;padding:6px 4px;color:#666;font-weight:600;}
  td{padding:6px 4px;border-bottom:1px solid #eee;}
  .pos{color:#1e7d46;}.neg{color:#c2542e;}
  .num,.pos,.neg{text-align:right;font-variant-numeric:tabular-nums;}
  .summary{display:flex;gap:28px;margin:14px 0;padding:12px;background:#f7f7f8;border-radius:10px;font-size:13px;}
  ul{font-size:13px;line-height:1.7;padding-left:18px;} small{color:#999;}
</style></head><body>
<h1>${escapeHtml(report.title)}</h1>
<p class="meta">Generated ${shortDayLabel(today)} · Personal budget report · Currency: ${currency} · recorded data only</p>
<div class="summary">
  <span>Income<br><b style="color:#1e7d46">${formatMoneyFull(income)}</b></span>
  <span>Outflow<br><b style="color:#c2542e">${formatMoneyFull(outflow)}</b></span>
  <span>Net<br><b>${formatMoneyFull(income - outflow)}</b></span>
  <span>Transactions<br><b>${report.transactions.length}</b></span>
</div>
${catRows ? `<h2>Spending by category</h2><table><tbody>${catRows}</tbody></table>` : ""}
<h2>Transactions</h2>
${
  report.transactions.length
    ? `<table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>${txRows}</tbody></table>`
    : "<p style='color:#888;font-size:12px'>No recorded transactions in this period.</p>"
}
${actList}
<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>
</body></html>`);
  win.document.close();
}