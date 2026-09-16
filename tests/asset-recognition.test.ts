// Follow-up correctness fix — asset account recognition (Net Worth/Growth).
//
// Root cause: production's real account_type enum has 10 values, but
// growth/page.tsx's asset-side total (and calculateNetWorthGrowth's
// opening-net-worth math) only ever recognized "checking"/"savings"/
// "investment" as assets, so a real "cash", "bank" or "mobile_money"
// account — all genuinely usable types — silently contributed to NEITHER
// assets nor debts: it just vanished from Net Worth. Fixed via one shared
// predicate (isAssetAccount / isAssetAccountType / ASSET_ACCOUNT_TYPES in
// @/lib/calculations), the asset-side counterpart to the existing debt
// helper, imported everywhere a "total assets" figure is computed.
//
// "other" is deliberately excluded from the shared classification (zero
// production usage, no discriminator, not guessed either way) — see that
// constant's doc comment for the full reasoning.
import { describe, it, expect } from "vitest";
import {
  calculateNetWorthGrowth, isAssetAccount, isAssetAccountType, isDebtAccount, ASSET_ACCOUNT_TYPES,
} from "@/lib/calculations";
import { calendarYearPeriod } from "@/lib/period";
import type { Account } from "@/data/model/types";

const period = calendarYearPeriod(2026);

function account(type: Account["type"], openingBalance: number): Account {
  return { id: type, name: type, type, openingBalance, currentBalance: openingBalance, currency: "USD", active: true };
}

describe("isAssetAccountType / isAssetAccount — the shared predicate", () => {
  it("recognizes every supported asset type", () => {
    for (const t of ["cash", "bank", "mobile_money", "checking", "savings", "investment"] as const) {
      expect(isAssetAccountType(t)).toBe(true);
    }
  });

  it("does not recognize debt types as assets", () => {
    expect(isAssetAccountType("credit")).toBe(false);
    expect(isAssetAccountType("credit_card")).toBe(false);
    expect(isAssetAccountType("loan")).toBe(false);
  });

  it("does NOT classify 'other' as an asset (no discriminator — left unclassified, not guessed)", () => {
    expect(isAssetAccountType("other")).toBe(false);
  });

  it("ASSET_ACCOUNT_TYPES is exactly the six supported asset types", () => {
    expect([...ASSET_ACCOUNT_TYPES].sort()).toEqual(
      ["bank", "cash", "checking", "investment", "mobile_money", "savings"]
    );
  });
});

describe("Each individual asset type contributes to Net Worth", () => {
  const cases: Array<[Account["type"], number]> = [
    ["cash", 500], ["bank", 2000], ["mobile_money", 1000],
    ["checking", 3000], ["savings", 4000], ["investment", 2000],
  ];
  for (const [type, amount] of cases) {
    it(`${type} (+${amount}) contributes its full balance to net worth`, () => {
      const accounts = [account(type, amount)];
      const growth = calculateNetWorthGrowth(accounts, [], period);
      for (const row of growth) expect(row.value).toBe(amount);
      expect(isAssetAccount(accounts[0])).toBe(true);
    });
  }
});

describe("Each debt type contributes as a liability", () => {
  const cases: Array<[Account["type"], number]> = [
    ["credit", -1500], ["credit_card", -1500], ["loan", -2000],
  ];
  for (const [type, opening] of cases) {
    it(`${type} (opening ${opening}) subtracts abs(${opening}) from net worth`, () => {
      const accounts = [account("checking", 5000), account(type, opening)];
      const growth = calculateNetWorthGrowth(accounts, [], period);
      const expected = 5000 - Math.abs(opening);
      for (const row of growth) expect(row.value).toBe(expected);
      expect(isDebtAccount(accounts[1])).toBe(true);
    });
  }
});

describe("Mixed-account example — Assets = 12,500, Debt = 3,500, Net Worth = 9,000", () => {
  const accounts: Account[] = [
    account("cash", 500),
    account("bank", 2000),
    account("mobile_money", 1000),
    account("checking", 3000),
    account("savings", 4000),
    account("investment", 2000),
    account("credit_card", -1500),
    account("loan", -2000),
  ];

  it("calculateNetWorthGrowth (the dashboard/chart calculation) produces 9,000", () => {
    const growth = calculateNetWorthGrowth(accounts, [], period);
    for (const row of growth) expect(row.value).toBe(9000);
  });

  it("growth/page.tsx's own formula (isAssetAccount/isDebtAccount) agrees exactly with the dashboard calculation", () => {
    // Reproduces growth/page.tsx's exact arithmetic — proving the page's
    // metric cards and the shared chart data can never disagree, since
    // both now derive from the same two predicates.
    const assets = accounts.filter((a) => isAssetAccount(a)).reduce((sum, a) => sum + a.currentBalance, 0);
    const debts = accounts.filter((a) => isDebtAccount(a)).reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
    const netWorth = assets - debts;

    expect(assets).toBe(12500);
    expect(debts).toBe(3500);
    expect(netWorth).toBe(9000);

    const growth = calculateNetWorthGrowth(accounts, [], period);
    expect(growth[0].value).toBe(netWorth); // the two code paths agree
  });

  it("an 'other'-typed account is excluded from both sides rather than guessed", () => {
    const withOther = [...accounts, account("other", 999999)];
    const growth = calculateNetWorthGrowth(withOther, [], period);
    for (const row of growth) expect(row.value).toBe(9000); // unchanged — "other" counted nowhere
    const assets = withOther.filter((a) => isAssetAccount(a)).reduce((sum, a) => sum + a.currentBalance, 0);
    const debts = withOther.filter((a) => isDebtAccount(a)).reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);
    expect(assets).toBe(12500); // "other" balance not added here...
    expect(debts).toBe(3500); // ...nor here
  });
});
