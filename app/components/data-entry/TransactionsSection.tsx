"use client";

import { useMemo, useState } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { Transaction, TransactionStatus } from "@/data/model/types";
import {
  Field,
  TextInput,
  SelectBox,
  SectionTitle,
  ActionButton,
  btnPrimary,
  btnGhost,
  Empty,
  DataTable,
  DataRow,
  DataCell,
} from "./shared";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function TransactionsSection() {
  const { transactions, accounts, categories, addTransaction, updateTransaction, deleteTransaction } = useDashboardData();

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "income" | "expense" | "transfer">("all");

  // Form state
  const [date, setDate] = useState("");
  const [type, setType] = useState<Transaction["type"]>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TransactionStatus>("cleared");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setEditing(null);
    setDate("");
    setType("expense");
    setAmount("");
    setAccountId(accounts[0]?.id ?? "");
    setCategoryId("");
    setToAccountId("");
    setDescription("");
    setStatus("cleared");
    setNotes("");
    setShowForm(false);
  };

  const startEdit = (tx: Transaction) => {
    setEditing(tx);
    setDate(tx.date);
    setType(tx.type);
    setAmount(String(tx.amount));
    setAccountId(tx.accountId);
    setCategoryId(tx.categoryId);
    setToAccountId(tx.toAccountId ?? "");
    setDescription(tx.description);
    setStatus(tx.status);
    setNotes(tx.notes ?? "");
    setShowForm(true);
  };

  const filtered = useMemo(() => {
    return [...transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((t) => filter === "all" || t.type === filter)
      .slice(0, 200);
  }, [transactions, filter]);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const submit = () => {
    const num = Number(amount);
    if (!date || !description || !Number.isFinite(num) || num <= 0 || !accountId) return;
    if (type === "transfer") {
      if (!toAccountId || toAccountId === accountId) return;
      addTransaction({
        date,
        accountId,
        categoryId: categoryId || accounts.find((a) => a.id === toAccountId)?.id || "c6",
        type: "transfer",
        amount: num,
        description,
        status,
        notes: notes || undefined,
        toAccountId,
      });
    } else {
      const catId =
        categoryId ||
        categories.find((c) => c.type === (type === "income" ? "income" : "expense"))?.id ||
        "";
      if (!catId) return;
      addTransaction({
        date,
        accountId,
        categoryId: catId,
        type,
        amount: num,
        description,
        status,
        notes: notes || undefined,
      });
    }
    resetForm();
  };

  const saveEdit = () => {
    if (!editing) return;
    const num = Number(amount);
    if (!date || !description || !Number.isFinite(num) || num <= 0 || !accountId) return;
    if (type === "transfer") {
      if (!toAccountId || toAccountId === accountId) return;
      updateTransaction(editing.id, {
        date, type, amount: num, accountId,
        categoryId: categoryId || "c6",
        description, status, notes: notes || undefined, toAccountId,
      });
    } else {
      updateTransaction(editing.id, {
        date, type, amount: num, accountId,
        categoryId: categoryId || undefined,
        description, status, notes: notes || undefined, toAccountId: undefined,
      });
    }
    resetForm();
  };

  return (
    <div>
      <SectionTitle>Transactions</SectionTitle>

      <div className="mb-2 flex flex-wrap items-center gap-1">
        {(["all", "income", "expense", "transfer"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded border px-2 py-0.5 text-[10px] capitalize ${
              filter === f
                ? "border-blue bg-blue text-white"
                : "border-border bg-card text-secondary-text"
            }`}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto">
          <button className={btnPrimary} onClick={() => { resetForm(); setShowForm((s) => !s); }}>
            {showForm ? "Cancel" : "+ Add Transaction"}
          </button>
        </div>
      </div>

      {showForm ? (
        <div className="mb-2 space-y-1.5 rounded border border-border bg-card p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Date">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Type">
              <SelectBox value={type} onChange={(e) => setType(e.target.value as Transaction["type"])}>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="transfer">Transfer</option>
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
          {type === "transfer" ? (
            <div className="grid grid-cols-2 gap-1.5">
              <Field label="To Account">
                <SelectBox value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  <option value="">Select…</option>
                  {accounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </SelectBox>
              </Field>
              <Field label="Category">
                <SelectBox value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Auto</option>
                  {categories
                    .filter((c) => c.group !== "income")
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </SelectBox>
              </Field>
            </div>
          ) : (
            <Field label="Category">
              <SelectBox value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Select…</option>
                {categories
                  .filter((c) => c.type === (type === "income" ? "income" : "expense"))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </SelectBox>
            </Field>
          )}
          <Field label="Description">
            <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Groceries" />
          </Field>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Status">
              <SelectBox value={status} onChange={(e) => setStatus(e.target.value as TransactionStatus)}>
                <option value="pending">Pending</option>
                <option value="cleared">Cleared</option>
                <option value="reconciled">Reconciled</option>
              </SelectBox>
            </Field>
            <Field label="Notes">
              <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button className={btnGhost} onClick={resetForm}>Cancel</button>
            <button className={btnPrimary} onClick={editing ? saveEdit : submit}>
              {editing ? "Save" : "Add Transaction"}
            </button>
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <Empty>No transactions yet — add one.</Empty>
      ) : (
        <DataTable columns={["Date", "Type", "Account", "Category", "Description", "Amount", "Status", "Actions"]}>
          {filtered.map((tx, i) => (
            <DataRow key={tx.id} last={i === filtered.length - 1}>
              <DataCell>{tx.date}</DataCell>
              <DataCell>
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                    tx.type === "income"
                      ? "bg-green-100 text-green-700"
                      : tx.type === "transfer"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-orange/20 text-orange-700"
                  }`}
                >
                  {tx.type}
                </span>
              </DataCell>
              <DataCell>
                {accountName(tx.accountId)}
                {tx.toAccountId ? ` → ${accountName(tx.toAccountId)}` : ""}
              </DataCell>
              <DataCell>{categoryName(tx.categoryId)}</DataCell>
              <DataCell>{tx.description}</DataCell>
              <DataCell
                className={`font-medium tabular-nums ${
                  tx.type === "income"
                    ? "text-green-600"
                    : tx.type === "expense"
                      ? "text-red-600"
                      : "text-blue-600"
                }`}
              >
                {tx.type === "income" ? "+" : "-"}
                {fmt(tx.amount)}
              </DataCell>
              <DataCell>
                <span className="capitalize">{tx.status}</span>
              </DataCell>
              <DataCell>
                <div className="flex items-center gap-1">
                  <ActionButton label="Edit" onClick={() => startEdit(tx)} />
                  <ActionButton label="Delete" variant="danger" onClick={() => deleteTransaction(tx.id)} />
                </div>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}
    </div>
  );
}