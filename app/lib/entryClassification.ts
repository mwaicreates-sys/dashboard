// Shared Entry-card classification (extracted from EntryTab.tsx's
// `kindForTx` so the Entry cards and each card's detail-view destination
// can never disagree about which transactions belong to which card).
//
// The Entry page's "Other" card explicitly needs a real detail
// destination (/other), and that page must show EXACTLY the same
// transactions the card itself counts — duplicating this logic in two
// places would risk exactly the drift this file exists to prevent.
import type { Account, Category, Transaction } from "@/data/model/types";
import { isDebtAccountType } from "@/lib/calculations";

export type EntryKindId = "income" | "outflow" | "savings" | "debt" | "investments" | "other";

/** Category group -> Entry kind, for the four groups with an unambiguous
 *  one-to-one mapping. "investments" is handled separately (checked
 *  before anything else, below) since it doesn't fit this simple map. */
const GROUP_TO_KIND: Record<string, EntryKindId> = {
  income: "income",
  bills: "outflow",
  expenses: "outflow",
  savings: "savings",
  debt: "debt",
};

/**
 * Classify one transaction (or planned transaction — same shape) into
 * exactly one of the six Entry kinds. Mirrors EntryTab.tsx's original
 * `kindForTx` precisely (verified equivalent), generalized to take plain
 * lookup maps instead of closing over component state, so it can be
 * shared between the Entry cards and their detail pages.
 */
export function classifyEntryKind(
  tx: Pick<Transaction, "categoryId" | "accountId" | "toAccountId" | "type">,
  catById: Map<string, Category>,
  accById: Map<string, Account>
): EntryKindId {
  const category = catById.get(tx.categoryId);
  const group = category?.group;

  if (group === "investments") return "investments";

  const inferredTransferKind = (() => {
    const accountTypes = [
      accById.get(tx.accountId)?.type,
      tx.toAccountId ? accById.get(tx.toAccountId)?.type : undefined,
    ].filter((type): type is NonNullable<typeof type> => Boolean(type));
    if (accountTypes.some((type) => type === "savings")) return "savings" as const;
    if (accountTypes.some((type) => type === "investment")) return "investments" as const;
    if (accountTypes.some((type) => isDebtAccountType(type))) return "debt" as const;
    return null;
  })();

  if (tx.type === "income") return "income";
  if (tx.type === "transfer" && inferredTransferKind) return inferredTransferKind;

  const byGroup = group !== undefined ? GROUP_TO_KIND[group] : undefined;
  if (byGroup) return byGroup;

  // Fallback for legacy or partially-missing category metadata: still
  // classify real financial movement by name heuristics before giving up.
  if (tx.type === "expense" || tx.type === "transfer") {
    const name = category?.name.toLowerCase();
    if (name?.includes("loan") || name?.includes("credit")) return "debt";
    if (name?.includes("savings") || name?.includes("reserve") || name?.includes("emergency")) return "savings";
    if (name?.includes("investment") || name?.includes("equipment") || name?.includes("retirement") || name?.includes("expansion")) return "investments";
    // Genuinely unclassifiable: every real CategoryGroup value is already
    // claimed by GROUP_TO_KIND above, so reaching here means the category
    // is missing, orphaned, or carries an unrecognized group — not a
    // normal expense. Falls to "other" rather than being silently counted
    // as ordinary spending.
    return "other";
  }

  return "other";
}
