// Phase 5 — recurring transaction next-occurrence date math.
//
// The system only supports monthly/yearly recurrence (see
// data/model/types.ts's Recurrence union) generated when the current
// occurrence is paid (dashboardData.tsx's payPlannedTransaction). Daily
// and weekly are intentionally not part of the data model — there is no
// UI, type, or persisted field for them anywhere in the app, so they are
// not exercised here as a "supported but untested" gap.
import { describe, it, expect } from "vitest";
import { addMonths } from "@/data/store";

describe("addMonths — recurring next-occurrence date math", () => {
  it("advances a normal mid-month date by one month", () => {
    expect(addMonths("2026-01-15", 1)).toBe("2026-02-15");
  });

  it("clamps Jan 31 + 1 month to Feb 28 in a non-leap year (does not roll into March)", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("clamps Jan 31 + 1 month to Feb 29 in a leap year", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("clamps a 31-day-month date into a 30-day target month", () => {
    expect(addMonths("2026-08-31", 1)).toBe("2026-09-30");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("rolls Dec 31 + 1 month into January of the next year", () => {
    expect(addMonths("2026-12-31", 1)).toBe("2027-01-31");
  });

  it("handles a yearly (12-month) advance, including leap -> non-leap Feb 29", () => {
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addMonths("2026-01-31", 12)).toBe("2027-01-31");
  });
});
