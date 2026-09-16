import type { Transaction } from "@/data/model/types";

/**
 * A transfer's effect on ONE of its two accounts, derived — never
 * persisted — from the single canonical `type: "transfer"` Transaction
 * row (accountId = source, toAccountId = destination, amount = the one
 * unsigned magnitude both legs share). This is a presentation-only
 * interpretation for ledgers/activity views; it does not change how
 * balances are computed (see accountDelta in dashboardData.tsx, which
 * already applies this exact same signed logic when summing balances —
 * this helper just exposes that same interpretation for display).
 */
export interface TransferAccountEffect {
  direction: "in" | "out";
  signedAmount: number;
  counterpartyAccountId: string;
}

/**
 * Returns how a transfer affects `accountId`, or null if the transaction
 * isn't a transfer touching that account at all. Never creates a second
 * financial record — this is read-only math over the one persisted row.
 */
export function getTransferAccountEffect(
  tx: Pick<Transaction, "type" | "accountId" | "toAccountId" | "amount">,
  accountId: string
): TransferAccountEffect | null {
  if (tx.type !== "transfer" || !tx.toAccountId) return null;
  if (tx.accountId === accountId) {
    return { direction: "out", signedAmount: -tx.amount, counterpartyAccountId: tx.toAccountId };
  }
  if (tx.toAccountId === accountId) {
    return { direction: "in", signedAmount: tx.amount, counterpartyAccountId: tx.accountId };
  }
  return null;
}
