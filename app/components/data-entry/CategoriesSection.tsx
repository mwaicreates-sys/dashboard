"use client";

import { useState } from "react";
import { useDashboardData } from "@/lib/dashboardData";
import { Category, CategoryGroup, CategoryType } from "@/data/model/types";
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

const GROUPS: CategoryGroup[] = ["income", "savings", "investments", "bills", "expenses", "debt"];
const TYPE_OPTIONS: CategoryType[] = ["income", "expense"];

const PRESET_COLORS = [
  "#3B7A9E", "#4A909B", "#5B8C5A", "#F4B860", "#E87A5D",
  "#D9A05B", "#6BA6A0", "#D96B82", "#8E9AAF", "#7BAE7F",
  "#E8A87C", "#B48EAD", "#78C6A3", "#A3A380", "#999999",
  "#C9605E", "#8D6E63", "#A37AB4", "#7B8FA1", "#4A6FA5",
];

export function CategoriesSection() {
  const { categories, addCategory, updateCategory, deleteCategory } = useDashboardData();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const [name, setName] = useState("");
  const [group, setGroup] = useState<CategoryGroup>("expenses");
  const [type, setType] = useState<CategoryType>("expense");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const resetForm = () => {
    setEditing(null);
    setName("");
    setGroup("expenses");
    setType("expense");
    setColor(PRESET_COLORS[0]);
    setShowForm(false);
  };

  const startEdit = (c: Category) => {
    setEditing(c);
    setName(c.name);
    setGroup(c.group);
    setType(c.type);
    setColor(c.color);
    setShowForm(true);
  };

  const submit = () => {
    if (!name) return;
    if (editing) {
      updateCategory(editing.id, { name, group, type, color });
    } else {
      addCategory({ name, group, type, color });
    }
    resetForm();
  };

  return (
    <div>
      <SectionTitle>Categories</SectionTitle>

      <div className="mb-2 flex items-center justify-end">
        <button className={btnPrimary} onClick={() => { resetForm(); setShowForm((s) => !s); }}>
          {showForm ? "Cancel" : "+ Add Category"}
        </button>
      </div>

      {showForm ? (
        <div className="mb-2 space-y-1.5 rounded border border-border bg-card p-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries" />
            </Field>
            <Field label="Group">
              <SelectBox value={group} onChange={(e) => setGroup(e.target.value as CategoryGroup)}>
                {GROUPS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </SelectBox>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="Type">
              <SelectBox value={type} onChange={(e) => setType(e.target.value as CategoryType)}>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </SelectBox>
            </Field>
            <Field label="Color">
              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-4 w-4 rounded-full border ${color === c ? "ring-2 ring-blue" : "border-border"}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </Field>
          </div>
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button className={btnGhost} onClick={resetForm}>Cancel</button>
            <button className={btnPrimary} onClick={submit}>
              {editing ? "Save" : "Add Category"}
            </button>
          </div>
        </div>
      ) : null}

      {categories.length === 0 ? (
        <Empty>No categories — add one.</Empty>
      ) : (
        <DataTable columns={["Name", "Group", "Type", "Color", "Actions"]}>
          {categories.map((c, i) => (
            <DataRow key={c.id} last={i === categories.length - 1}>
              <DataCell>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </span>
              </DataCell>
              <DataCell>
                <span className="capitalize">{c.group}</span>
              </DataCell>
              <DataCell>
                <span className="capitalize">{c.type}</span>
              </DataCell>
              <DataCell>
                <span className="inline-block h-3 w-6 rounded border border-border" style={{ backgroundColor: c.color }} />
              </DataCell>
              <DataCell>
                <div className="flex items-center gap-1">
                  <ActionButton label="Edit" onClick={() => startEdit(c)} />
                  <ActionButton label="Delete" variant="danger" onClick={() => deleteCategory(c.id)} />
                </div>
              </DataCell>
            </DataRow>
          ))}
        </DataTable>
      )}
    </div>
  );
}