"use client";

import { useDashboardData } from "@/lib/dashboardData";

export function CompactTable({
  title,
  headers,
  rows,
  showProgress,
}: {
  title: string;
  headers: string[];
  rows: Array<Record<string, string | number>>;
  showProgress?: boolean;
}) {
  return (
    <div>
      <h3 className="mb-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-secondary-text">
        {title}
      </h3>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-left text-[10px] sm:text-[11px]">
          <thead>
            <tr className="border-b border-border bg-card">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-1.5 py-0.75 sm:px-1.5 sm:py-1 font-medium text-muted-text"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={idx}
                className="border-b border-light-border last:border-b-0"
              >
                {headers.map((h) => (
                  <td key={h} className="px-1.5 py-0.75 sm:px-1.5 sm:py-1 text-primary-text">
                    {showProgress && h === "Amount" ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 text-right tabular-nums sm:w-7">
                          {row[h] as string}
                        </span>
                        <div className="h-0.75 sm:h-1 flex-1 rounded-full bg-border">
                          <div
                            className="h-0.75 sm:h-1 rounded-full bg-orange"
                            style={{ width: `${(row.percentage as number)}%` }}
                          />
                        </div>
                        <span className="w-4 text-right tabular-nums text-muted-text sm:w-5">
                          {row.percentage as number}%
                        </span>
                      </div>
                    ) : (
                      <span className="tabular-nums">{row[h] as string}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TopOutflowTable() {
  const { topOutflows } = useDashboardData();
  const rows = topOutflows.map((item) => ({
    Name: item.name,
    Amount: item.amount,
    percentage: item.percentage,
  }));
  return (
    <CompactTable
      title="Top 20 Outflow"
      headers={["Name", "Amount"]}
      rows={rows}
    />
  );
}

export function TopSpendingsTable() {
  const { topSpendings } = useDashboardData();
  const rows = topSpendings.map((item) => ({
    Name: item.name,
    Amount: item.amount,
    percentage: item.percentage,
  }));
  return (
    <CompactTable
      title="Top 20 Spendings"
      headers={["Name", "Amount"]}
      rows={rows}
      showProgress
    />
  );
}