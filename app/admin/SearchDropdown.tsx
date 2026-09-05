"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BuildingIcon, SearchIcon } from "./icons";

export interface SearchBusiness {
  id: string;
  name: string;
  ownerEmail: string | null;
}

/**
 * Admin global search — client-side filtering over already-loaded business
 * data. No server request per keystroke: the dataset is small (platform
 * scale) and pre-fetched once by the admin layout.
 *
 * Keyboard: ↑↓ to navigate, Enter to open, Escape to close.
 * Click-outside closes the panel.
 */
export function SearchDropdown({ businesses }: { businesses: SearchBusiness[] }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return businesses
      .filter((b) => {
        const name = b.name.toLowerCase();
        const email = (b.ownerEmail ?? "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 8);
  }, [query, businesses]);

  const showResults = open && query.trim().length > 0;
  const hasNoResults = showResults && results.length === 0;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Reset active index when results change.
  useEffect(() => {
    setActiveIndex(-1); // eslint-disable-line react-hooks/set-state-in-effect
  }, [results.length]);

  const navigateTo = useCallback(
    (id: string) => {
      setOpen(false);
      setQuery("");
      setActiveIndex(-1);
      router.push(`/admin/businesses/${id}`);
    },
    [router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i < results.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : results.length - 1));
    } else if (e.key === "Enter" && activeIndex >= 0 && activeIndex < results.length) {
      e.preventDefault();
      navigateTo(results[activeIndex].id);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-text" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search"
          aria-label="Search businesses"
          className="h-9 w-40 rounded-xl border border-border bg-card pl-9 pr-3 text-sm font-inter text-primary-text outline-none transition-all placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-violet-500/60"
        />
      </div>

      {showResults && (
        <div
          role="listbox"
          className="dropdown-enter absolute right-0 top-full z-50 mt-2 w-72 origin-top-right rounded-2xl border border-border bg-surface p-2 shadow-lg"
        >
          {hasNoResults ? (
            <div className="px-3 py-6 text-center">
              <p className="font-inter text-sm font-medium text-primary-text">No results found</p>
              <p className="mt-1 text-[11px] text-muted-text">
                Try a different business name or email.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {results.map((b, i) => (
                <li key={b.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    onClick={() => navigateTo(b.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-100 ${
                      i === activeIndex
                        ? "bg-violet-500/10"
                        : "hover:bg-card"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue/10 text-blue">
                      <BuildingIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-inter text-[14px] font-medium text-primary-text">
                        {b.name}
                      </span>
                      <span className="block truncate text-[13px] text-secondary-text">
                        {b.ownerEmail ?? "No owner"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

