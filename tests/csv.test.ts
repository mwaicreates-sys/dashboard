import { describe, it, expect } from "vitest";
import { csvEscape, rowsToCsv } from "@/lib/csv";

describe("csvEscape — formula-injection neutralization", () => {
  it("prefixes a user-text cell starting with = with a guarding apostrophe", () => {
    expect(csvEscape("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
  });

  it("prefixes a user-text cell starting with + ", () => {
    expect(csvEscape("+1+2")).toBe("'+1+2");
  });

  it("prefixes a user-text cell starting with @", () => {
    expect(csvEscape("@cmd|'/c calc'!A1")).toBe("'@cmd|'/c calc'!A1");
  });

  it("prefixes a non-numeric cell starting with - (formula-like, not a plain amount)", () => {
    expect(csvEscape("-cmd|'/c calc'!A1")).toBe("'-cmd|'/c calc'!A1");
  });

  it("does NOT alter a plain negative numeric amount string", () => {
    expect(csvEscape("-1234.56")).toBe("-1234.56");
  });

  it("does NOT alter a plain positive numeric amount string", () => {
    expect(csvEscape("1234.56")).toBe("1234.56");
  });

  it("does NOT alter a number-typed value even when negative", () => {
    expect(csvEscape(-42)).toBe("-42");
  });

  it("does NOT alter ordinary description text", () => {
    expect(csvEscape("Grocery shopping")).toBe("Grocery shopping");
  });

  it("still quotes cells containing commas/quotes/newlines, after guarding", () => {
    expect(csvEscape('=A,"B"')).toBe(`"'=A,""B"""`);
  });
});

describe("rowsToCsv", () => {
  it("neutralizes an injected description while leaving the amount column exact", () => {
    const rows: Array<Array<string | number>> = [
      ["Date", "Description", "Amount"],
      ["2026-09-16", "=cmd|'/c calc'!A1", "-1234.56"],
    ];
    const csv = rowsToCsv(rows);
    const lines = csv.split("\n");
    expect(lines[1]).toBe(`2026-09-16,'=cmd|'/c calc'!A1,-1234.56`);
  });
});
