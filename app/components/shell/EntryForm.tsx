"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDashboardData } from "@/lib/dashboardData";
import type { Account, Transaction, TransactionType, CategoryGroup, AccountType, PlannedTransaction, Recurrence } from "@/data/model/types";
import { todayISO, formatMoneyFull } from "@/lib/dates";
import { getCurrency } from "@/lib/currency";
import { isDebtAccount } from "@/lib/calculations";
import { XIcon } from "./icons";
import { SearchableSelect } from "./SearchableSelect";

const GROUP_COLORS: Record<CategoryGroup, string> = {
  income: "#3B7A9E",
  savings: "#A37AB4",
  investments: "#3B7A9E",
  bills: "#E87A5D",
  expenses: "#7BAE7F",
  debt: "#C9605E",
};

const GROUP_TYPE_MAP: Record<CategoryGroup, "income" | "expense"> = {
  income: "income",
  savings: "expense",
  investments: "expense",
  bills: "expense",
  expenses: "expense",
  debt: "expense",
};

const ACCOUNT_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "investment", label: "Investment" },
  { value: "credit", label: "Credit Card" },
  { value: "loan", label: "Loan" },
];

const CATEGORY_GROUPS: Array<{ value: CategoryGroup; label: string }> = [
  { value: "income", label: "Income" },
  { value: "bills", label: "Bills" },
  { value: "expenses", label: "Expenses" },
  { value: "savings", label: "Savings" },
  { value: "investments", label: "Investments" },
  { value: "debt", label: "Debt" },
];

/**
 * What field set / financial behavior a card uses. The card the user
 * clicked already communicates their intent — `mode` is what lets
 * EntryForm answer "what does this card need to ask" instead of showing
 * one generic transaction-configuration form for everything.
 *
 *  - "income"    — money received. Account + optional source text only.
 *  - "outflow"   — money spent. Category + Account are genuinely needed
 *                  (the only place categorization is the point); Schedule
 *                  and Status are secondary, behind "More options".
 *  - "assetMove" — an internal asset/liability movement: Savings, Debt,
 *                  Investments. Always a `type: "transfer"` between the
 *                  chosen source account and an inferred destination
 *                  account (see `targetAccountTypes`) — never a category
 *                  picker, never a transfer toggle, because the transfer
 *                  IS the transaction; there's no other option to choose.
 *  - "other"     — the one card with no inferable intent. Keeps the full
 *                  existing configuration (type/category/account), since
 *                  that configuration is exactly what's genuinely unknown.
 */
export type EntryMode = "income" | "outflow" | "assetMove" | "other";

export interface KindConfig {
  id: string;
  label: string;
  /** Category groups offered for this card ("other" offers everything). */
  groups: string[];
  defaultType: TransactionType;
  /** Show full Income/Expense/Transfer segmented control ("other" only). */
  chooseType: boolean;
  /** Legacy expense⇄transfer toggle — unused now that Savings/Debt/
   *  Investments are always transfers by construction by mode, kept only
   *  so old callers/tests referencing the field shape don't break. */
  transferToggle: boolean;
  mode: EntryMode;
  /** mode "assetMove" only: Account.type values that represent this
   *  card's destination/target bucket (savings account, investment
   *  account, credit/loan account, ...). Matched against real accounts
   *  to decide whether the destination can be inferred silently (exactly
   *  one match), must be asked (more than one), or must first be created
   *  (none). */
  targetAccountTypes?: string[];
  /** mode "assetMove" only: the Account.type used when CREATING a new
   *  destination account for this card (the app's own vocabulary — kept
   *  narrower than `targetAccountTypes`, which also recognizes
   *  differently-named legacy/imported account types on READ). */
  createAccountType?: AccountType;
  /** mode "assetMove" only: connecting word before the destination
   *  account name, e.g. "into" (Savings/Investments) or "toward" (Debt). */
  moveVerb?: string;
  /** mode "assetMove" only: noun used as the fallback description and in
   *  the destination-account creation prompt, e.g. "Savings". */
  moveNoun?: string;
  /** Modal title for a brand-new entry, e.g. "Add to savings". */
  addTitle: string;
  /** Modal subtitle shown under the title. */
  subtitle: string;
  /** Primary button label for a brand-new entry, e.g. "Add to savings". */
  cta: string;
}

const inputCls =
  "h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60";
const labelCls =
  "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-text";

/**
 * The one Entry system behind all six cards. Every card still creates or
 * edits a real Transaction through the existing provider CRUD — balances,
 * budget actuals, charts and KPIs all recalculate from the same store —
 * but the FIELDS shown and the semantics applied are specialized per
 * `kind.mode`, so the user only answers what the app cannot already infer
 * from which card they clicked.
 *
 * Viewport-aware layout: header and action footer are pinned, the form
 * body scrolls, so submit/cancel can never be clipped — even on short
 * screens, zoom or mobile keyboards.
 */
export function EntryForm({
  kind,
  editTx,
  editPlanned,
  onClose,
}: {
  kind: KindConfig;
  editTx?: Transaction | null;
  /** Edit an existing scheduled/planned entry instead of a real transaction. */
  editPlanned?: PlannedTransaction | null;
  onClose: () => void;
}) {
  const {
    accounts,
    categories,
    currency,
    saveEntry,
    addAccount,
    addCategory,
    addPlanned,
    updatePlanned,
  } = useDashboardData();

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const entryIdRef = useRef(editTx?.id ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const closeForm = useCallback(() => {
    if (!savingRef.current) onClose();
  }, [onClose]);

  const activeCurrency = getCurrency(currency);
  const amountSymbol = activeCurrency.symbol;

  const activeAccounts = useMemo(() => accounts.filter((a) => a.active), [accounts]);
  const editingEntity = editTx ?? editPlanned;
  const isAssetMove = kind.mode === "assetMove";
  const isIncomeMode = kind.mode === "income";
  const isOutflowMode = kind.mode === "outflow";
  const isOtherMode = kind.mode === "other";

  const [txType, setTxType] = useState<TransactionType>(editingEntity?.type ?? kind.defaultType);
  const [amount, setAmount] = useState(editingEntity ? String(editingEntity.amount) : "");
  const [date, setDate] = useState(editingEntity?.date ?? todayISO());
  const [description, setDescription] = useState(editingEntity?.description ?? "");
  const [categoryId, setCategoryId] = useState(editingEntity?.categoryId ?? "");
  const [accountId, setAccountId] = useState(editingEntity?.accountId ?? activeAccounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(editingEntity?.toAccountId ?? "");
  const [status, setStatus] = useState<Transaction["status"]>(editTx?.status ?? "cleared");
  const [notes, setNotes] = useState(editTx?.notes ?? "");
  const [showNotes, setShowNotes] = useState<boolean>(!!editTx?.notes);
  // Scheduling: a brand-new entry can be recorded now (a real Transaction,
  // the existing behavior) or scheduled for later (a PlannedTransaction,
  // shown in "Upcoming & recurring" / EntryTab's Scheduled list until it's
  // paid or cancelled). Only Outflow and Other offer this — Income and the
  // asset-move cards (Savings/Debt/Investments) are always recorded now,
  // per the simplified-entry design (nothing to defer: the user is
  // reporting money that already moved).
  const [scheduleForLater, setScheduleForLater] = useState(false);
  const canSchedule = !editingEntity && (isOutflowMode || isOtherMode);
  const isPlannedMode = !!editPlanned || (canSchedule && scheduleForLater);
  const [recurrence, setRecurrence] = useState<Recurrence>(editPlanned?.recurrence ?? "once");

  // Outflow only: Schedule/Status are secondary, tucked behind "More options".
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState<AccountType>("checking");
  const [newAccountOpening, setNewAccountOpening] = useState("0");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryGroup, setNewCategoryGroup] = useState<CategoryGroup>(kind.groups[0] as CategoryGroup);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // ---- Asset-move destination (Savings / Debt / Investments) ----
  // The destination is INFERRED, never configured: exactly one matching
  // account is used silently; more than one means the app genuinely can't
  // guess and asks; none means there's nothing to move money into yet, so
  // the smallest necessary account is created first (also asked, once).
  const targetAccounts = useMemo(
    () => (isAssetMove ? activeAccounts.filter((a) => kind.targetAccountTypes?.includes(a.type)) : []),
    [isAssetMove, activeAccounts, kind]
  );
  // An explicit selection (user picked one of several, or editing seeded
  // one) always wins; otherwise, when exactly one destination account
  // exists, it's inferred at render time — no effect/state sync needed,
  // and nothing is asked the app can already answer itself.
  const [selectedTargetAccountId, setSelectedTargetAccountId] = useState(editingEntity?.toAccountId ?? "");
  const targetAccountId =
    selectedTargetAccountId || (targetAccounts.length === 1 ? targetAccounts[0].id : "");
  const [showTargetAccountDialog, setShowTargetAccountDialog] = useState(false);
  const [newTargetAccountName, setNewTargetAccountName] = useState("");
  const [newTargetAccountAmount, setNewTargetAccountAmount] = useState("0");
  const [savingTargetAccount, setSavingTargetAccount] = useState(false);
  const [targetAccountError, setTargetAccountError] = useState<string | null>(null);

  // Phase 3: the dialog only closes (and the new id only gets selected)
  // once the account is actually acknowledged by Supabase — previously
  // this closed unconditionally before the cloud write was even attempted.
  const createAccount = async () => {
    const name = newAccountName.trim();
    if (!name || savingAccount) return;
    const openingBalance = Math.max(0, Number(newAccountOpening) || 0);
    setSavingAccount(true);
    setAccountError(null);
    try {
      const id = await addAccount({ name, type: newAccountType, openingBalance, currency, active: true });
      setAccountId(id);
      setNewAccountName("");
      setNewAccountType("checking");
      setNewAccountOpening("0");
      setShowAccountDialog(false);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Could not save the account. Please retry.");
    } finally {
      setSavingAccount(false);
    }
  };

  // Debt's destination account is stored as a NEGATIVE balance (amount
  // owed) — matching this app's and production's existing convention
  // (accountDelta applies the same signed transfer math to every account
  // type; a negative loan/credit balance is what makes a payment TOWARD
  // it move the number back toward zero instead of away from it). Savings
  // and Investments destinations are ordinary positive starting balances.
  const createTargetAccount = async () => {
    const name = newTargetAccountName.trim();
    if (!name || savingTargetAccount || !kind.createAccountType) return;
    const entered = Math.max(0, Number(newTargetAccountAmount) || 0);
    const openingBalance = kind.id === "debt" ? -entered : entered;
    setSavingTargetAccount(true);
    setTargetAccountError(null);
    try {
      const id = await addAccount({
        name, type: kind.createAccountType, openingBalance, currency, active: true,
      });
      setSelectedTargetAccountId(id);
      setNewTargetAccountName("");
      setNewTargetAccountAmount("0");
      setShowTargetAccountDialog(false);
    } catch (error) {
      setTargetAccountError(error instanceof Error ? error.message : "Could not save the account. Please retry.");
    } finally {
      setSavingTargetAccount(false);
    }
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || savingCategory) return;
    const group = newCategoryGroup;
    setSavingCategory(true);
    setCategoryError(null);
    try {
      const id = await addCategory({ name, group, type: GROUP_TYPE_MAP[group], color: GROUP_COLORS[group] });
      setCategoryId(id);
      setNewCategoryName("");
      setNewCategoryGroup(kind.groups[0] as CategoryGroup);
      setShowCategoryDialog(false);
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : "Could not save the category. Please retry.");
    } finally {
      setSavingCategory(false);
    }
  };

  // Escape closes; body scroll locks while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAccountDialog) {
          setShowAccountDialog(false);
        } else if (showCategoryDialog) {
          setShowCategoryDialog(false);
        } else if (showTargetAccountDialog) {
          setShowTargetAccountDialog(false);
        } else {
          closeForm();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [closeForm, showAccountDialog, showCategoryDialog, showTargetAccountDialog]);

  const catOptions = useMemo(
    () =>
      categories
        .filter((c) => {
          if (kind.id !== "other" && !kind.groups.includes(c.group)) return false;
          return txType === "income" ? c.type === "income" : c.type === "expense";
        })
        .map((c) => ({ id: c.id, label: c.name })),
    [categories, kind, txType]
  );

  const accountOptions = useMemo(
    () =>
      activeAccounts.map((a) => ({
        id: a.id,
        label: a.name,
        subtitle: a.type,
      })),
    [activeAccounts]
  );

  const targetAccountOptions = useMemo(
    () => targetAccounts.map((a) => ({ id: a.id, label: a.name, subtitle: a.type })),
    [targetAccounts]
  );

  const resolvedCatName =
    categories.find((c) => c.id === categoryId)?.name ?? kind.label;

  // Cross-currency transfer guard (follow-up correctness fix). The
  // existing transfer mechanism (recomputeBalances/accountDelta) applies
  // the SAME raw numeric amount to both the source and destination
  // account — correct only when they share a currency; 100 USD is not
  // 100 KES. Until a deliberate FX-conversion model exists for transfers,
  // any transfer between differently-denominated accounts is blocked
  // outright rather than silently misrepresenting the amount on one side.
  // Applies to every mode that can produce a `type: "transfer"`
  // transaction: the asset-move cards (Savings/Debt/Investments) and
  // Other's transfer toggle.
  const sourceAccount = activeAccounts.find((a) => a.id === accountId);
  const destinationAccountId = isAssetMove ? targetAccountId : toAccountId;
  const destinationAccount = activeAccounts.find((a) => a.id === destinationAccountId);
  const isTransferLike = isAssetMove || (isOtherMode && txType === "transfer");
  const currencyMismatch =
    isTransferLike && !!sourceAccount && !!destinationAccount && sourceAccount.currency !== destinationAccount.currency;

  const valid = useMemo(() => {
    const amountOk = Number(amount) > 0;
    if (!amountOk || !accountId) return false;
    if (currencyMismatch) return false;
    if (isAssetMove) {
      return targetAccounts.length === 0 ? false : !!targetAccountId && targetAccountId !== accountId;
    }
    if (isIncomeMode) return true;
    if (isOtherMode) {
      const descOk = description.trim().length > 0;
      return descOk && !!categoryId && (txType !== "transfer" || (!!toAccountId && toAccountId !== accountId));
    }
    // outflow
    return !!categoryId;
  }, [amount, accountId, currencyMismatch, isAssetMove, targetAccounts, targetAccountId, isIncomeMode, isOtherMode, description, categoryId, txType, toAccountId]);

  /** Find an existing category in this card's group, or create exactly
   *  one the first time it's needed — the user is never asked. */
  const resolveKindCategoryId = async (): Promise<string> => {
    const group = kind.groups[0] as CategoryGroup;
    const existing = categories.find((c) => c.group === group);
    if (existing) return existing.id;
    return addCategory({
      name: kind.moveNoun ?? kind.label,
      group,
      type: GROUP_TYPE_MAP[group],
      color: GROUP_COLORS[group],
    });
  };

  const save = async () => {
    if (!valid || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    // Never infer from the active DISPLAY currency (Phase 2 fix): an
    // existing entry keeps whatever currency it already had; a new one
    // takes its (source) account's real currency.
    const resolvedCurrency = editingEntity?.currency ?? accounts.find((a) => a.id === accountId)?.currency;
    try {
      if (isAssetMove) {
        const resolvedCategoryId = editingEntity?.categoryId ?? (await resolveKindCategoryId());
        entryIdRef.current ??= `tx-${crypto.randomUUID()}`;
        const payload = {
          date,
          accountId,
          categoryId: resolvedCategoryId,
          type: "transfer" as TransactionType,
          amount: Number(amount),
          description: notes.trim() || kind.moveNoun || kind.label,
          status: "cleared" as const,
          currency: resolvedCurrency,
          toAccountId: targetAccountId,
        };
        await saveEntry({ ...editTx, ...payload, id: entryIdRef.current });
      } else if (isIncomeMode) {
        const resolvedCategoryId = editingEntity?.categoryId ?? (await resolveKindCategoryId());
        entryIdRef.current ??= `tx-${crypto.randomUUID()}`;
        const payload = {
          date,
          accountId,
          categoryId: resolvedCategoryId,
          type: "income" as TransactionType,
          amount: Number(amount),
          description: description.trim() || "Income",
          status: "cleared" as const,
          currency: resolvedCurrency,
        };
        await saveEntry({ ...editTx, ...payload, id: entryIdRef.current });
      } else if (isPlannedMode) {
        const plannedPayload = {
          date,
          accountId,
          categoryId,
          type: txType,
          amount: Number(amount),
          description: description.trim() || resolvedCatName,
          recurrence,
          currency: resolvedCurrency,
          toAccountId: txType === "transfer" ? toAccountId : undefined,
        };
        if (editPlanned) {
          await updatePlanned(editPlanned.id, plannedPayload);
        } else {
          await addPlanned({ ...plannedPayload, status: "pending" });
        }
      } else {
        entryIdRef.current ??= `tx-${crypto.randomUUID()}`;
        const payload = {
          date,
          accountId,
          categoryId,
          type: txType,
          amount: Number(amount),
          description: description.trim() || resolvedCatName,
          status,
          currency: resolvedCurrency,
          notes: notes.trim() ? notes.trim() : undefined,
          toAccountId: txType === "transfer" ? toAccountId : undefined,
        };
        await saveEntry({ ...editTx, ...payload, id: entryIdRef.current });
      }
      savingRef.current = false;
      closeForm();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Save was not confirmed. Please retry.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const title = editTx
    ? `Edit ${kind.label.toLowerCase()}`
    : editPlanned
      ? `Edit scheduled ${kind.label.toLowerCase()}`
      : isPlannedMode
        ? `Schedule ${kind.label.toLowerCase()}`
        : kind.addTitle;

  const ctaLabel = saving
    ? "Saving…"
    : editingEntity
      ? "Save changes"
      : isPlannedMode
        ? `Schedule ${kind.label.toLowerCase()}`
        : kind.cta;

  const targetAccountName = targetAccounts.find((a) => a.id === targetAccountId)?.name;

  return createPortal(
    <>
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeForm();
        }}
      >
        <div
          className="modal-sheet w-full max-w-md rounded-t-3xl border border-border bg-surface shadow-xl sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Pinned header */}
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-light-border px-4 pb-3 pt-4 md:px-5">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-text">
                Entry
              </p>
              <h2 className="mt-0.5 text-2xl font-semibold leading-tight text-primary-text">
                {title}
              </h2>
              {!editingEntity && kind.subtitle ? (
                <p className="mt-0.5 text-xs text-secondary-text">{kind.subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Close form"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </header>

          {/* Scrollable form body */}
          <fieldset disabled={saving} className="modal-body min-w-0 px-4 py-4 md:px-5">
            {/* Transfer traceability: this edit modal doubles as the
                "transfer detail" view for an existing transfer — the ONE
                canonical transaction already has both accountId (source)
                and toAccountId (destination), so both effects are shown
                up front instead of leaving the user to infer where the
                money went from the account+category fields below. */}
            {editTx && editTx.type === "transfer" && editTx.toAccountId ? (
              <TransferEffectSummary tx={editTx} accounts={accounts} />
            ) : null}

            {/* Amount + date */}
            <div className="flex gap-2">
              <label className="min-w-0 flex-1">
                <span className={labelCls}>
                  Amount · {activeCurrency.code}
                  {editingEntity?.currency && editingEntity.currency !== currency
                    ? ` · stored in ${editingEntity.currency}`
                    : ""}
                </span>
                <div className="relative">
                  <span
                    className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold tabular-nums text-secondary-text"
                    aria-hidden="true"
                  >
                    {amountSymbol}
                  </span>
                  <input
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step={activeCurrency.decimals === 0 ? "1" : "0.01"}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={activeCurrency.decimals === 0 ? "0" : "0.00"}
                    aria-label={`Amount in ${activeCurrency.code}`}
                    autoFocus
                    className={`${inputCls} pl-10`}
                  />
                </div>
              </label>
              <label className="w-36 shrink-0">
                <span className={labelCls}>Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Date"
                  className={inputCls}
                />
              </label>
            </div>

            {/* ---- Other: full type selector (the one card with no inferable intent) ---- */}
            {isOtherMode && kind.chooseType ? (
              <div className="mt-3">
                <span className={labelCls}>Type</span>
                <Segmented
                  value={txType}
                  onChange={setTxType}
                  options={[
                    { v: "income" as TransactionType, l: "Income" },
                    { v: "expense" as TransactionType, l: "Expense" },
                    { v: "transfer" as TransactionType, l: "Transfer" },
                  ]}
                />
              </div>
            ) : null}

            {/* ---- Income: optional free-text source ---- */}
            {isIncomeMode ? (
              <label className="mt-3 block">
                <span className={labelCls}>Source (optional)</span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Salary"
                  aria-label="Source"
                  className={inputCls}
                />
              </label>
            ) : null}

            {/* ---- Other: required description ---- */}
            {isOtherMode ? (
              <label className="mt-3 block">
                <span className={labelCls}>Description</span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What was it for?"
                  aria-label="Description"
                  className={inputCls}
                />
              </label>
            ) : null}

            {/* ---- Income: account only ---- */}
            {isIncomeMode ? (
              <label className="mt-3 block">
                <span className={labelCls}>Account</span>
                <SearchableSelect
                  items={accountOptions}
                  value={accountId}
                  onChange={setAccountId}
                  onAddNew={() => setShowAccountDialog(true)}
                  placeholder="Select account…"
                  searchPlaceholder="Search accounts…"
                  addLabel="Add account"
                />
              </label>
            ) : null}

            {/* ---- Outflow / Other: category + account ---- */}
            {isOutflowMode || isOtherMode ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className={labelCls}>Category</span>
                  <SearchableSelect
                    items={catOptions}
                    value={categoryId}
                    onChange={setCategoryId}
                    onAddNew={() => setShowCategoryDialog(true)}
                    placeholder="Select category…"
                    searchPlaceholder="Search categories…"
                    addLabel="Add category"
                  />
                </label>
                <label className="block">
                  <span className={labelCls}>Account</span>
                  <SearchableSelect
                    items={accountOptions}
                    value={accountId}
                    onChange={setAccountId}
                    onAddNew={() => setShowAccountDialog(true)}
                    placeholder="Select account…"
                    searchPlaceholder="Search accounts…"
                    addLabel="Add account"
                  />
                </label>
              </div>
            ) : null}

            {isOtherMode && txType === "transfer" ? (
              <label className="mt-2 block">
                <span className={labelCls}>To account</span>
                <select
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  aria-label="Destination account"
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  {activeAccounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}

            {/* ---- Savings / Debt / Investments: from account + inferred destination ---- */}
            {isAssetMove ? (
              <>
                <label className="mt-3 block">
                  <span className={labelCls}>From account</span>
                  <SearchableSelect
                    items={accountOptions}
                    value={accountId}
                    onChange={setAccountId}
                    onAddNew={() => setShowAccountDialog(true)}
                    placeholder="Select account…"
                    searchPlaceholder="Search accounts…"
                    addLabel="Add account"
                  />
                </label>

                {targetAccounts.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-border bg-card/30 px-3 py-3">
                    <p className="text-[11px] text-muted-text">
                      {kind.id === "debt"
                        ? "No debt account yet — add the one this payment goes toward."
                        : `No ${(kind.moveNoun ?? kind.label).toLowerCase()} account yet — add one to move money into.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowTargetAccountDialog(true)}
                      className="mt-2 h-8 rounded-lg border border-border bg-card px-3 text-[11px] font-medium text-primary-text transition-colors hover:bg-light-border focus-visible:ring-2 focus-visible:ring-blue/60"
                    >
                      {kind.id === "debt" ? "Add debt account" : `Add ${(kind.moveNoun ?? kind.label).toLowerCase()} account`}
                    </button>
                  </div>
                ) : targetAccounts.length === 1 ? (
                  targetAccountName ? (
                    <p className="mt-2 text-[11px] text-muted-text">
                      {kind.moveVerb ?? "into"} <span className="font-medium text-secondary-text">{targetAccountName}</span>
                    </p>
                  ) : null
                ) : (
                  <label className="mt-3 block">
                    <span className={labelCls}>
                      {kind.id === "debt" ? "Pay toward" : `${kind.moveNoun ?? kind.label} account`}
                    </span>
                    <SearchableSelect
                      items={targetAccountOptions}
                      value={targetAccountId}
                      onChange={setSelectedTargetAccountId}
                      onAddNew={() => setShowTargetAccountDialog(true)}
                      placeholder="Select account…"
                      searchPlaceholder="Search accounts…"
                      addLabel={kind.id === "debt" ? "Add debt account" : `Add ${(kind.moveNoun ?? kind.label).toLowerCase()} account`}
                    />
                  </label>
                )}
              </>
            ) : null}

            {/* ---- Outflow: progressive disclosure for Schedule + Status ---- */}
            {isOutflowMode ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setMoreOptionsOpen((s) => !s)}
                  aria-expanded={moreOptionsOpen}
                  className="rounded text-[11px] font-medium text-secondary-text transition-colors hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
                >
                  {moreOptionsOpen ? "Hide more options" : "More options"}
                </button>
              </div>
            ) : null}

            {isOutflowMode && moreOptionsOpen && canSchedule ? (
              <button
                type="button"
                onClick={() => setScheduleForLater((s) => !s)}
                aria-pressed={scheduleForLater}
                className="mt-2 flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-light-border focus-visible:ring-2 focus-visible:ring-blue/60"
              >
                <span>
                  <span className="block text-xs font-medium text-primary-text">Schedule for later</span>
                  <span className="block text-[10px] text-muted-text">Save as upcoming — only counts once you pay it</span>
                </span>
                <span
                  className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
                    scheduleForLater ? "bg-blue" : "bg-border"
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                      scheduleForLater ? "translate-x-4" : ""
                    }`}
                  />
                </span>
              </button>
            ) : null}

            {/* Other: schedule stays available too (existing behavior) */}
            {isOtherMode && canSchedule ? (
              <button
                type="button"
                onClick={() => setScheduleForLater((s) => !s)}
                aria-pressed={scheduleForLater}
                className="mt-3 flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-light-border focus-visible:ring-2 focus-visible:ring-blue/60"
              >
                <span>
                  <span className="block text-xs font-medium text-primary-text">Schedule for later</span>
                  <span className="block text-[10px] text-muted-text">Save as upcoming — only counts once you pay it</span>
                </span>
                <span
                  className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
                    scheduleForLater ? "bg-blue" : "bg-border"
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                      scheduleForLater ? "translate-x-4" : ""
                    }`}
                  />
                </span>
              </button>
            ) : null}

            {/* Status (real transactions) / Repeat (planned entries) —
                Outflow: behind More options. Other: always shown (existing
                behavior). Income/asset-move: never shown — always recorded
                now, as cleared. */}
            {isPlannedMode ? (
              <label className="mt-3 block">
                <span className={labelCls}>Repeat</span>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as Recurrence)}
                  aria-label="Repeat"
                  className={`${inputCls} h-9`}
                >
                  <option value="once">Once · doesn&apos;t repeat</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
            ) : isOtherMode || (isOutflowMode && moreOptionsOpen) ? (
              <label className="mt-3 block">
                <span className={labelCls}>Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Transaction["status"])}
                  aria-label="Status"
                  className={`${inputCls} h-9`}
                >
                  <option value="cleared">Cleared · counted now</option>
                  <option value="pending">Pending · not counted yet</option>
                  <option value="reconciled">Reconciled</option>
                </select>
              </label>
            ) : null}

            {/* Note — Outflow/asset-move: a single optional line, shown
                directly (it's one of the few fields these cards ask for).
                Other: the existing toggle-to-reveal textarea. */}
            {(isOutflowMode || isAssetMove) && !isPlannedMode ? (
              <label className="mt-3 block">
                <span className={labelCls}>Note (optional)</span>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Details, context…"
                  aria-label="Note"
                  className={inputCls}
                />
              </label>
            ) : null}

            {isOtherMode && !isPlannedMode ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowNotes((s) => !s)}
                  className="mt-2 rounded text-[11px] font-medium text-secondary-text transition-colors hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
                >
                  {showNotes ? "Hide notes" : "+ Add note"}
                </button>
                {showNotes ? (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Details, context…"
                    aria-label="Notes"
                    className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60"
                  />
                ) : null}
              </>
            ) : null}

            {currencyMismatch ? (
              <p role="alert" className="mt-3 text-center text-[10px] font-medium text-orange">
                Transfers between different currencies aren&apos;t supported yet.
              </p>
            ) : !valid ? (
              <p className="mt-3 text-center text-[10px] text-muted-text">
                {isAssetMove && targetAccounts.length === 0
                  ? `Amount, from account, and a ${(kind.moveNoun ?? kind.label).toLowerCase()} account are required.`
                  : isAssetMove
                    ? "Amount, from account, and a destination account are required."
                    : isOtherMode
                      ? `Amount, description, category and account are required${txType === "transfer" ? " — pick two different accounts for transfers." : "."}`
                      : "Amount, category and account are required."}
              </p>
            ) : null}
          </fieldset>

          {saveError ? <p role="alert" className="px-4 py-2 text-xs text-red-600">{saveError}</p> : null}
          {/* Pinned action footer */}
          <footer className="modal-footer">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="h-10 rounded-xl border border-border bg-card px-4 text-xs font-medium text-secondary-text transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-blue/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!valid || saving}
                className="h-10 flex-1 rounded-xl bg-blue text-xs font-semibold text-white transition-colors hover:bg-blue/90 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue/60"
              >
                {ctaLabel}
              </button>
            </div>
          </footer>
        </div>
      </div>

      {/* Quick-add dialogs */}
      {showAccountDialog &&
        createPortal(
          <QuickAddDialog
            title="Add account"
            fields={
              <>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Account name</span>
                  <input
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="e.g. Checking"
                    aria-label="Account name"
                    className={inputCls}
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Type</span>
                  <select
                    value={newAccountType}
                    onChange={(e) => setNewAccountType(e.target.value as AccountType)}
                    aria-label="Account type"
                    className={`${inputCls} h-9`}
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Opening balance</span>
                  <input
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newAccountOpening}
                    onChange={(e) => setNewAccountOpening(e.target.value)}
                    placeholder="0.00"
                    aria-label="Opening balance"
                    className={inputCls}
                  />
                </label>
              </>
            }
            onCreate={createAccount}
            onCancel={() => {
              setShowAccountDialog(false);
              setNewAccountName("");
              setNewAccountOpening("0");
              setAccountError(null);
            }}
            disabled={!newAccountName.trim()}
            busy={savingAccount}
            error={accountError}
          />,
          document.body
        )}

      {showTargetAccountDialog &&
        createPortal(
          <QuickAddDialog
            title={kind.id === "debt" ? "Add debt account" : `Add ${(kind.moveNoun ?? kind.label).toLowerCase()} account`}
            fields={
              <>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Account name</span>
                  <input
                    value={newTargetAccountName}
                    onChange={(e) => setNewTargetAccountName(e.target.value)}
                    placeholder={kind.id === "debt" ? "e.g. Credit Card" : `e.g. ${kind.moveNoun ?? kind.label}`}
                    aria-label="Account name"
                    className={inputCls}
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">
                    {kind.id === "debt" ? "Current amount owed" : "Starting balance"}
                  </span>
                  <input
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newTargetAccountAmount}
                    onChange={(e) => setNewTargetAccountAmount(e.target.value)}
                    placeholder="0.00"
                    aria-label={kind.id === "debt" ? "Current amount owed" : "Starting balance"}
                    className={inputCls}
                  />
                </label>
              </>
            }
            onCreate={createTargetAccount}
            onCancel={() => {
              setShowTargetAccountDialog(false);
              setNewTargetAccountName("");
              setNewTargetAccountAmount("0");
              setTargetAccountError(null);
            }}
            disabled={!newTargetAccountName.trim()}
            busy={savingTargetAccount}
            error={targetAccountError}
          />,
          document.body
        )}

      {showCategoryDialog &&
        createPortal(
          <QuickAddDialog
            title="Add category"
            fields={
              <>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Category name</span>
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Groceries"
                    aria-label="Category name"
                    className={inputCls}
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-text">Group</span>
                  <select
                    value={newCategoryGroup}
                    onChange={(e) => setNewCategoryGroup(e.target.value as CategoryGroup)}
                    aria-label="Category group"
                    className={`${inputCls} h-9`}
                  >
                    {(kind.id === "other"
                      ? CATEGORY_GROUPS
                      : CATEGORY_GROUPS.filter((g) => kind.groups.includes(g.value))
                    ).map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </label>
              </>
            }
            onCreate={createCategory}
            onCancel={() => {
              setShowCategoryDialog(false);
              setNewCategoryName("");
              setCategoryError(null);
            }}
            disabled={!newCategoryName.trim()}
            busy={savingCategory}
            error={categoryError}
          />,
          document.body
        )}
    </>,
    document.body
  );
}

function QuickAddDialog({
  title,
  fields,
  onCreate,
  onCancel,
  disabled,
  busy,
  error,
}: {
  title: string;
  fields: React.ReactNode;
  onCreate: () => void;
  onCancel: () => void;
  disabled: boolean;
  busy?: boolean;
  error?: string | null;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel, busy]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="modal-sheet w-full max-w-sm rounded-t-3xl border border-border bg-surface shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-light-border px-4 pb-3 pt-4 md:px-5">
          <h3 className="text-lg font-semibold leading-tight text-primary-text">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60 disabled:opacity-40"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <fieldset disabled={busy} className="modal-body px-4 py-4 md:px-5">
          <div className="space-y-2.5">{fields}</div>
        </fieldset>

        {error ? <p role="alert" className="px-4 py-2 text-xs text-red-600">{error}</p> : null}

        <footer className="modal-footer">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="h-10 rounded-xl border border-border bg-card px-4 text-xs font-medium text-secondary-text transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-blue/60 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onCreate}
              disabled={disabled || busy}
              className="h-10 flex-1 rounded-xl bg-blue text-xs font-semibold text-white transition-colors hover:bg-blue/90 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue/60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * Read-only "both effects" breakdown for an existing transfer — answers
 * "where did this money go" directly from the one canonical Transaction
 * (accountId/toAccountId/amount), never a second persisted record.
 *
 * Debt/credit destinations get explicit wording instead of a bare "+"
 * sign: a payment TOWARD a debt account reduces the amount owed, so a
 * naked "+$200" next to "Credit Card" would read backwards. Symmetric
 * clarifier on the source side for the mirror case (a transfer OUT of a
 * debt account, e.g. a cash advance, which increases what's owed).
 */
function TransferEffectSummary({ tx, accounts }: { tx: Transaction; accounts: Account[] }) {
  const fromAcc = accounts.find((a) => a.id === tx.accountId);
  const toAcc = accounts.find((a) => a.id === tx.toAccountId);
  const fromIsDebt = !!fromAcc && isDebtAccount(fromAcc);
  const toIsDebt = !!toAcc && isDebtAccount(toAcc);
  const statusLabel = tx.status === "cleared" ? "Completed" : tx.status === "pending" ? "Pending" : "Reconciled";

  return (
    <div className="mb-3 rounded-xl border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <p className={labelCls}>Transfer</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
            tx.status === "pending" ? "bg-amber-500/10 text-amber-600" : "bg-green/10 text-green"
          }`}
        >
          {statusLabel}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted-text">From</p>
          <p className="truncate text-xs font-medium text-primary-text">{fromAcc?.name ?? "—"}</p>
          <p className="text-sm font-semibold tabular-nums text-orange">
            −{formatMoneyFull(tx.amount)}
          </p>
          {fromIsDebt ? <p className="text-[9px] text-muted-text">Increases amount owed</p> : null}
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted-text">To</p>
          <p className="truncate text-xs font-medium text-primary-text">{toAcc?.name ?? "—"}</p>
          <p className="text-sm font-semibold tabular-nums text-green">
            +{formatMoneyFull(tx.amount)}
          </p>
          {toIsDebt ? <p className="text-[9px] text-muted-text">Reduces amount owed</p> : null}
        </div>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ v: T; l: string }>;
}) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-border bg-card p-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          className={`h-8 rounded-lg text-xs font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-blue/60 ${
            value === o.v ? "bg-blue text-white" : "text-secondary-text hover:bg-light-border"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
