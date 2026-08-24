"use client";

import { useState } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import {
  PlannedTransaction,
  PlannedTransactionStatus,
  Recurrence,
  TransactionType,
} from "@/data/model/types";
import {
  Field,
  TextInput,
  SelectBox,
  SectionTitle,
  ActionButton,
  btnPrimary,
    btnGhost,
  btnPaid,
  Empty,
  DataTable,
  DataRow,
  DataCell,
} from "./shared";

const TYPES: TransactionType[] = ["income", "expense", "transfer"];
const RECURRENCES: Recurrence[] = ["once", "monthly", "yearly"];

/** Action button label based on transaction type. */
const PAY_LABEL: Record<TransactionType, string> = {
  expense: "✓ Paid",
  income: "✓ Received",
  transfer: "✓ Completed",
};

/** Status display label (for completed/cancelled rows). */
const STATUS_DISPLAY: Record<TransactionType, Record<PlannedTransactionStatus, string>> = {
  expense: { pending: "🔵 Pending", completed: "🟢 Paid", cancelled: "⚪ Cancelled" },
  income: { pending: "🔵 Pending", completed: "🟢 Received", cancelled: "⚪ Cancelled" },
  transfer: { pending: "🔵 Pending", completed: "🟢 Completed", cancelled: "⚪ Cancelled" },
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function PlannedTransactionsSection() {
    const {
    plannedTransactions,
    accounts,
    categories,
    addPlanned,
    updatePlanned,
    deletePlanned,
    payPlannedTransaction,
    cancelPlannedTransaction,
  } = useDashboardData();

      const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlannedTransaction | null>(null);

  const [date, setDate] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [recurrence, setRecurrence] = useState<Recurrence>("once");
  const [toAccountId, setToAccountId] = useState("");

  const resetForm = () => {
    setEditing(null);
    setDate("");
    setAccountId(accounts[0]?.id ?? "");
    setCategoryId("");
    setDescription("");
    setAmount("");
    setType("expense");
    setRecurrence("once");
    setToAccountId("");
    setShowForm(false);
  };

  const startEdit = (p: PlannedTransaction) => {
    setEditing(p);
    setDate(p.date);
    setAccountId(p.accountId);
    setCategoryId(p.categoryId);
    setDescription(p.description);
    setAmount(String(p.amount));
    setType(p.type);
    setRecurrence(p.recurrence ?? "once");
    setToAccountId(p.toAccountId ?? "");
    setShowForm(true);
  };

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const submit = () => {
    const num = Number(amount);
    if (!date || !description || !Number.isFinite(num) || num <= 0 || !accountId || !categoryId) return;
    if (editing) {
      updatePlanned(editing.id, {
        date,
        accountId,
        categoryId,
        description,
        amount: num,
        type,
        recurrence,
        toAccountId: type === "transfer" && toAccountId ? toAccountId : undefined,
      });
    } else {
      addPlanned({
        date,
        accountId,
        categoryId,
        description,
        amount: num,
        type,
        status: "pending",
        recurrence,
        toAccountId: type === "transfer" && toAccountId ? toAccountId : undefined,
      });
    }
    resetForm();
  };

  const sorted = [...plannedTransactions].sort((a, b) => a.date.localeCompare(b.date));
  const activeAccounts = accounts.filter((a) => a.active && a.type !== "credit" && a.type !== "loan");

  return (
    <div>
      <SectionTitle>Planned Transactions</SectionTitle>

      <div className="mb-2 flex items-center justify-end">
        <button className={btnPrimary} onClick={() => { resetForm(); setShowForm((s) => !s); }}>
          {showForm ? "Cancel" : "+ Add"}
        </button>
      </div>

      {showForm ? (
        <div className="mb-2 space-y-1.5 rounded border border-border bg-card p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Date">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Type">
              <SelectBox value={type} onChange={(e) => setType(e.target.value as TransactionType)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </SelectBox>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Amount">
              <TextInput type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Account">
              <SelectBox value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </SelectBox>
            </Field>
          </div>
          <Field label="Category">
            <SelectBox value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </SelectBox>
          </Field>
          <Field label="Description">
            <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Monthly Rent" />
          </Field>
                              {type === "transfer" ? (
            <Field label="Destination Account">
              <SelectBox value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="">Select…</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </SelectBox>
            </Field>
          ) : null}
          <Field label="Recurrence">
            <SelectBox value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </SelectBox>
          </Field>
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button className={btnGhost} onClick={resetForm}>Cancel</button>
            <button className={btnPrimary} onClick={submit}>
              {editing ? "Save" : "Add Planned"}
            </button>
          </div>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <Empty>No planned transactions — add one.</Empty>
      ) : (
        <DataTable columns={["Date", "Description", "Type", "Amount", "Account", "Category", "Recurrence", "Status", "Actions"]}>
          {sorted.map((p, i) => {
            const isPending = p.status === "pending";
            const isCompleted = p.status === "completed";
            const isCancelled = p.status === "cancelled";
            return (
              <DataRow key={p.id} last={i === sorted.length - 1}>
                <DataCell>{p.date}</DataCell>
                <DataCell>{p.description}</DataCell>
                <DataCell><span className="capitalize">{p.type}</span></DataCell>
                <DataCell className="tabular-nums">{fmt(p.amount)}</DataCell>
                <DataCell>{accountName(p.accountId)}</DataCell>
                <DataCell>{categoryName(p.categoryId)}</DataCell>
                <DataCell><span className="capitalize">{p.recurrence ?? "once"}</span></DataCell>
                <DataCell>{STATUS_DISPLAY[p.type][p.status]}</DataCell>
                <DataCell>
                  <div className="flex items-center gap-1">
                    {isPending ? (
                      <>
                        <button className={`${btnPaid} h-5 px-1.5`} onClick={() => payPlannedTransaction(p.id)}>{PAY_LABEL[p.type]}</button>
                        <button className={btnGhost} onClick={() => cancelPlannedTransaction(p.id)} title="Cancel">✕</button>
                      </>
                    ) : isCompleted ? (
                      <span className="text-[10px] text-green-600">🟢 Paid</span>
                    ) : isCancelled ? (
                      <span className="text-[10px] text-muted-text">⚪ Cancelled</span>
                    ) : null}
                    <ActionButton label="Edit" onClick={() => startEdit(p)} />
                    <ActionButton label="Del" variant="danger" onClick={() => deletePlanned(p.id)} />
                  </div>
                </DataCell>
              </DataRow>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
