"use client";

import { useState } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { Account, AccountType } from "@/data/model/types";
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

const TYPE_LABEL: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  investment: "Investment",
  credit: "Credit",
  loan: "Loan",
};

export function AccountsSection() {
  const { accounts, addAccount, updateAccount, deleteAccount } = useDashboardData();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [openingBalance, setOpeningBalance] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [institution, setInstitution] = useState("");

  const resetForm = () => {
    setEditing(null);
    setName("");
    setType("checking");
    setOpeningBalance("");
    setCurrency("USD");
    setInstitution("");
    setShowForm(false);
  };

  const startEdit = (a: Account) => {
    setEditing(a);
    setName(a.name);
    setType(a.type);
    setOpeningBalance(String(a.openingBalance));
    setCurrency(a.currency);
    setInstitution(a.institution ?? "");
    setShowForm(true);
  };

  const submit = () => {
    if (!name) return;
    const num = Number(openingBalance);
    if (!Number.isFinite(num)) return;
    if (editing) {
      updateAccount(editing.id, {
        name,
        type,
        openingBalance: num,
        currency,
        institution: institution || undefined,
      });
    } else {
      addAccount({
        name,
        type,
        openingBalance: num,
        currency,
        institution: institution || undefined,
        active: true,
      });
    }
    resetForm();
  };

  const activeAccounts = accounts.filter((a) => a.active);

  return (
    <div>
      <SectionTitle>Accounts</SectionTitle>

      <div className="mb-2 flex items-center justify-end">
        <button className={btnPrimary} onClick={() => { resetForm(); setShowForm((s) => !s); }}>
          {showForm ? "Cancel" : "+ Add Account"}
        </button>
      </div>

      {showForm ? (
        <div className="mb-2 space-y-1.5 rounded border border-border bg-card p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Checking" />
            </Field>
            <Field label="Type">
              <SelectBox value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                {(Object.keys(TYPE_LABEL) as AccountType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </SelectBox>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Opening Balance">
              <TextInput type="number" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Currency">
              <TextInput value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD" />
            </Field>
          </div>
          <Field label="Institution">
            <TextInput value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Optional" />
          </Field>
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button className={btnGhost} onClick={resetForm}>Cancel</button>
            <button className={btnPrimary} onClick={submit}>
              {editing ? "Save" : "Add Account"}
            </button>
          </div>
        </div>
      ) : null}

      {activeAccounts.length === 0 ? (
        <Empty>No accounts — add one.</Empty>
      ) : (
        <DataTable columns={["Account", "Type", "Institution", "Opening Balance", "Current Balance", "Status", "Actions"]}>
          {activeAccounts.map((a, i) => (
            <DataRow key={a.id} last={i === activeAccounts.length - 1}>
              <DataCell>
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      a.currentBalance < 0 ? "bg-red-400" : "bg-green-500"
                    }`}
                  />
                  {a.name}
                </span>
              </DataCell>
              <DataCell>
                <span className="capitalize">{TYPE_LABEL[a.type]}</span>
              </DataCell>
              <DataCell>{a.institution ?? "—"}</DataCell>
              <DataCell className="tabular-nums">{fmt(a.openingBalance)}</DataCell>
              <DataCell className="tabular-nums">{fmt(a.currentBalance)}</DataCell>
              <DataCell>
                <span className="capitalize">{a.active ? "Active" : "Archived"}</span>
              </DataCell>
              <DataCell>
                <div className="flex items-center gap-1">
                  <ActionButton label="Edit" onClick={() => startEdit(a)} />
                  <ActionButton label="Archive" variant="danger" onClick={() => deleteAccount(a.id)} />
                </div>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}
    </div>
  );
}