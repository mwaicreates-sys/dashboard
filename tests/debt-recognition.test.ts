// Follow-up correctness fix — credit_card debt recognition.
//
// Root cause: production's real account_type enum includes "credit_card"
// as a distinct value from "credit", but every debt-recognition site in
// this app originally checked only `type === "credit" || "loan"`, so a
// real credit_card account silently contributed $0 to the Debts KPI, net
// worth, and the Debt card/detail page. Fixed via one shared predicate
// (isDebtAccount / isDebtAccountType / DEBT_ACCOUNT_TYPES in
// @/lib/calculations) that every site now imports instead of re-deriving
// its own type list.
import { describe, it, expect } from "vitest";
import {
  calculateKPIs, calculateNetWorthGrowth, isDebtAccount, isDebtAccountType, DEBT_ACCOUNT_TYPES,
} from "@/lib/calculations";
import { calendarYearPeriod } from "@/lib/period";
import { formatCurrencyCompact } from "@/lib/currency";
import type { Account } from "@/data/model/types";

const period = calendarYearPeriod(2026);

describe("isDebtAccountType / isDebtAccount — the shared predicate", () => {
  it("recognizes credit, credit_card, and loan as debt types", () => {
    expect(isDebtAccountType("credit")).toBe(true);
    expect(isDebtAccountType("credit_card")).toBe(true);
    expect(isDebtAccountType("loan")).toBe(true);
  });

  it("does not recognize asset types as debt", () => {
    expect(isDebtAccountType("checking")).toBe(false);
    expect(isDebtAccountType("savings")).toBe(false);
    expect(isDebtAccountType("investment")).toBe(false);
  });

  it("DEBT_ACCOUNT_TYPES is exactly the three supported liability types", () => {
    expect([...DEBT_ACCOUNT_TYPES].sort()).toEqual(["credit", "credit_card", "loan"]);
  });
});

describe("A. credit_card contributes to the Debts KPI", () => {
  it("a credit_card account's balance is included in totalDebt", () => {
    const accounts: Account[] = [
      { id: "checking", name: "Checking", type: "checking", openingBalance: 10000, currentBalance: 10000, currency: "USD", active: true },
      { id: "card", name: "Credit Card", type: "credit_card", openingBalance: -2000, currentBalance: -2000, currency: "USD", active: true },
    ];
    const kpis = calculateKPIs([], accounts, [], period);
    const debts = kpis.find((k) => k.label === "Debts")!;
    expect(isDebtAccount(accounts[1])).toBe(true);
    const totalDebt = accounts.filter((a) => isDebtAccount(a)).reduce((s, a) => s + Math.abs(a.currentBalance), 0);
    expect(totalDebt).toBe(2000);
    expect(debts.value).toBe(formatCurrencyCompact(2000, "USD"));
  });
});

describe("B. credit_card liability contributes correctly to Net Worth", () => {
  it("a -2000 credit_card opening balance subtracts 2000 from opening net worth", () => {
    const accounts: Account[] = [
      { id: "checking", name: "Checking", type: "checking", openingBalance: 10000, currentBalance: 10000, currency: "USD", active: true },
      { id: "card", name: "Credit Card", type: "credit_card", openingBalance: -2000, currentBalance: -2000, currency: "USD", active: true },
    ];
    const growth = calculateNetWorthGrowth(accounts, [], period);
    // No transactions yet, so every month's net worth equals the opening
    // net worth: 10000 (checking) - 2000 (debt) = 8000.
    for (const row of growth) expect(row.value).toBe(8000);
  });

  it("still works when the credit_card opening balance is (incorrectly) stored positive — coerced negative regardless of stored sign", () => {
    const accounts: Account[] = [
      { id: "checking", name: "Checking", type: "checking", openingBalance: 10000, currentBalance: 10000, currency: "USD", active: true },
      { id: "card", name: "Credit Card", type: "credit_card", openingBalance: 2000, currentBalance: 2000, currency: "USD", active: true },
    ];
    const growth = calculateNetWorthGrowth(accounts, [], period);
    for (const row of growth) expect(row.value).toBe(8000); // still subtracted, not added
  });
});
