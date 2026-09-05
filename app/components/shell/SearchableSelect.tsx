"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDownIcon } from "./icons";

const inputCls =
  "h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60";

export interface SelectItem {
  id: string;
  label: string;
  subtitle?: string;
}

interface SearchableSelectProps {
  items: SelectItem[];
  value: string;
  onChange: (value: string) => void;
  onAddNew: () => void;
  placeholder?: string;
  searchPlaceholder?: string;
  addLabel: string;
}

export function SearchableSelect({
  items,
  value,
  onChange,
  onAddNew,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  addLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = items.find((i) => i.id === value);
  const filtered = items.filter((i) =>
    i.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setQuery("");
        }}
        className={`${inputCls} flex items-center justify-between text-left`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "text-primary-text" : "text-muted-text"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-text" />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-[70] mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
          role="listbox"
        >
          <div className="p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className={inputCls}
              autoFocus
            />
          </div>
          <div className="max-h-52 overflow-y-auto px-2 pb-2">
            {filtered.length === 0 && query ? (
              <p className="px-2 py-2 text-center text-[11px] text-muted-text">
                No matches for &ldquo;{query}&rdquo;
              </p>
            ) : null}
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                  setQuery("");
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                  item.id === value
                    ? "bg-blue/10 text-blue"
                    : "text-primary-text hover:bg-card"
                }`}
                role="option"
                aria-selected={item.id === value}
              >
                <span className="font-medium">{item.label}</span>
                {item.subtitle ? (
                  <span className="ml-2 text-[11px] text-muted-text">
                    {item.subtitle}
                  </span>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAddNew();
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-2 py-2 text-left text-sm font-medium text-blue transition-colors hover:bg-blue/5"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue/10 text-[11px] font-bold">
                +
              </span>
              {addLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
