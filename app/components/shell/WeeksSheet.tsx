"use client";

import { useEffect, useRef } from "react";
import { WeeksTab } from "./WeeksTab";
import { XIcon } from "./icons";

/**
 * Full-screen weekly breakdown sheet — keeps Year → Week → Day reachable
 * from the Dashboard without a dedicated navigation tab.
 */
export function WeeksSheet({ onClose }: { onClose: () => void }) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={scrollContainerRef}
      className="fixed inset-0 z-[70] h-dvh min-h-0 overflow-y-auto overscroll-y-contain bg-surface/95 backdrop-blur-md touch-pan-y"
      role="dialog"
      aria-modal="true"
      aria-label="Weekly breakdown"
    >
      <div className="sticky top-0 z-10 flex justify-end px-3 pt-3 md:px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close weekly breakdown"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-secondary-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3 pb-40 md:px-4">
        <WeeksTab scrollContainerRef={scrollContainerRef} />
      </div>
    </div>
  );
}