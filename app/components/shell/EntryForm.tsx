"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDashboardData } from "@/lib/dashboardData";
import type { Transaction, TransactionType } from "@/data/model/types";
import { todayISO } from "@/lib/dates";
import { getCurrency } from "@/lib/currency";
import { XIcon } from "./icons";

export interface KindConfig {
  id: string;
  label: string;
  /** Category groups offered for this card ("other" offers everything). */
  groups: string[];
  defaultType: TransactionType;
  /** Show full Income/Expense/Transfer segmented control. */
  chooseType: boolean;
  /** Show a simple expense⇄transfer toggle (Savings/Debt style payments). */
  transferToggle: boolean;
}

const inputCls =
  "h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60";
const labelCls =
  "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-text";

/**
 * The one and only financial recording form. Creates or edits a real
 * Transaction through the existing provider CRUD — balances, budget
 * actuals, charts and KPIs all recalculate from the same store.
 *
 * Viewport-aware layout: header and action footer are pinned, the form
 * body scrolls, so submit/cancel can never be clipped — even on short
 * screens, zoom or mobile keyboards.
 */
export function EntryForm({
  kind,
  editTx,
  onClose,
}: {
  kind: KindConfig;
  editTx?: Transaction | null;
  onClose: () => void;
}) {
  const { accounts, categories, currency, addTransaction, updateTransaction } = useDashboardData();

  const activeCurrency = getCurrency(currency);
  const amountSymbol = activeCurrency.symbol;

  const activeAccounts = useMemo(() => accounts.filter((a) => a.active), [accounts]);
  const [txType, setTxType] = useState<TransactionType>(editTx?.type ?? kind.defaultType);
  const [amount, setAmount] = useState(editTx ? String(editTx.amount) : "");
  const [date, setDate] = useState(editTx?.date ?? todayISO());
  const [description, setDescription] = useState(editTx?.description ?? "");
  const [categoryId, setCategoryId] = useState(editTx?.categoryId ?? "");
  const [accountId, setAccountId] = useState(editTx?.accountId ?? activeAccounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(editTx?.toAccountId ?? "");
  const [status, setStatus] = useState<Transaction["status"]>(editTx?.status ?? "cleared");
  const [notes, setNotes] = useState(editTx?.notes ?? "");
  const [showNotes, setShowNotes] = useState<boolean>(!!editTx?.notes);

  // Escape closes; body scroll locks while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const catOptions = useMemo(
    () =>
      categories.filter((c) => {
        if (kind.id !== "other" && !kind.groups.includes(c.group)) return false;
        return txType === "income" ? c.type === "income" : c.type === "expense";
      }),
    [categories, kind, txType]
  );

  const resolvedCatName =
    categories.find((c) => c.id === categoryId)?.name ?? kind.label;

  const valid =
    Number(amount) > 0 &&
    !!accountId &&
    !!categoryId &&
    (txType !== "transfer" || (!!toAccountId && toAccountId !== accountId));

  const save = () => {
    if (!valid) return;
    const payload = {
      date,
      accountId,
      categoryId,
      type: txType,
      amount: Number(amount),
      description: description.trim() || resolvedCatName,
      status,
      // Store the entered amount in the active display currency by default;
      // when editing,keep the ORIGINAL stored currency so a record is never
      // re-converted from an already-converted value.

      currency: editTx?.currency ?? currency,
      notes: notes.trim() ? notes.trim() : undefined,
      toAccountId: txType === "transfer" ? toAccountId : undefined,
    };
    if (editTx) updateTransaction(editTx.id, payload);
    else addTransaction(payload);
    onClose();
  };

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${editTx ? "Edit" : "Add"} ${kind.label}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
            <h2 className="mt-0.5 font-serif text-2xl font-semibold leading-tight text-primary-text">
              {editTx ? "Edit" : "Add"} {kind.label.toLowerCase()}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close form"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        {/* Scrollable form body */}
        <div className="modal-body px-4 py-4 md:px-5">
          {/* Amount + date */}
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className={labelCls}>
                Amount · {activeCurrency.code}
                {editTx && editTx.currency && editTx.currency !== currency
                  ? ` · stored in ${editTx.currency}`
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
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={inputCls} />
            </label>
          </div>

          {/* Type selection */}
          {kind.chooseType ? (
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
          ) : kind.transferToggle ? (
            <button
              type="button"
              onClick={() => setTxType((t) => (t === "transfer" ? "expense" : "transfer"))}
              aria-pressed={txType === "transfer"}
              className="mt-3 flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-light-border focus-visible:ring-2 focus-visible:ring-blue/60"
            >
              <span>
                <span className="block text-xs font-medium text-primary-text">Transfer between accounts</span>
                <span className="block text-[10px] text-muted-text">Move money without touching budgets</span>
              </span>
              <span
                className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
                  txType === "transfer" ? "bg-blue" : "bg-border"
                }`}
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    txType === "transfer" ? "translate-x-4" : ""
                  }`}
                />
              </span>
            </button>
          ) : null}

          <label className="mt-3 block">
            <span className={labelCls}>Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`e.g. ${kind.label === "Other" ? "What was it for?" : kind.label}`}
              aria-label="Description"
              className={inputCls}
            />
          </label>

          {/* Category + account */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Category</span>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" className={inputCls}>
                <option value="">Select…</option>
                {catOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Account</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account" className={inputCls}>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {txType === "transfer" ? (
            <label className="mt-2 block">
              <span className={labelCls}>To account</span>
              <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} aria-label="Destination account" className={inputCls}>
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

          {/* Status */}
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

          {/* Notes */}
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

          {!valid ? (
            <p className="mt-3 text-center text-[10px] text-muted-text">
              Amount, category and account are required
              {txType === "transfer" ? " — pick two different accounts for transfers." : "."}
            </p>
          ) : null}
        </div>

        {/* Pinned action footer */}
        <footer className="modal-footer">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-border bg-card px-4 text-xs font-medium text-secondary-text transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-blue/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!valid}
              className="h-10 flex-1 rounded-xl bg-blue text-xs font-semibold text-white transition-colors hover:bg-blue/90 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue/60"
            >
              {editTx ? "Save changes" : `Add ${kind.label.toLowerCase()}`}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
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
