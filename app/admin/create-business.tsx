"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { XIcon } from "@/components/shell/icons";

const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "KES"] as const;

export function CreateBusinessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<string>("USD");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset transient status each time the modal opens. The modal stays
    // mounted (closed = renders null), so without this a stale success panel
    // would reappear on reopen. Intentional setState-in-effect (the modal's
    // open/close IS the external system being synchronized).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setSuccess(null);
    setActivationCode(null);
    setLoginUrl(null);
    setCopiedCode(false);
    setCopiedLink(false);
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
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    if (!isSupabaseConfigured()) {
      setError("Supabase is not configured");
      return;
    }

    const client = getSupabaseBrowserClient();
    if (!client) {
      setError("Could not connect to cloud");
      return;
    }

    if (!name.trim()) {
      setError("Enter a business name.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    setActivationCode(null);
    setLoginUrl(null);
    setCopiedCode(false);
    setCopiedLink(false);

    try {
      const { data: businessId, error: createError } = await client.rpc("admin_create_business", {
        p_currency: currency,
        p_name: name.trim(),
        p_owner_name: ownerName.trim() || null,
        p_owner_email: ownerEmail.trim() || null,
      });

      if (createError) {
        setError(createError.message);
        return;
      }

      const newBusinessId = typeof businessId === "string" ? businessId : null;
      if (!newBusinessId) {
        setError("Business creation returned invalid ID.");
        return;
      }

      if (ownerEmail.trim()) {
        // Generate the owner's activation code. The RPC returns a TEXT scalar,
        // so `data` IS the activation-code string itself.
        const { data: activationCode, error: activationError } = await client.rpc(
          "generate_owner_activation_code",
          {
            p_business_id: newBusinessId,
            p_email: ownerEmail.trim(),
          }
        );

        if (activationError) {
          setError(`Business created, but the owner activation code could not be generated: ${activationError.message}`);
          return;
        }

        if (typeof activationCode !== "string" || activationCode.length === 0) {
          setError("Business created, but the activation service returned no code.");
          return;
        }

        setActivationCode(activationCode);
        setLoginUrl(
          typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"
        );
        setSuccess("Business created successfully.");
      } else {
        setSuccess(`Business created in ${currency}.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(`Could not create the business: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!activationCode) return;
    try {
      await navigator.clipboard.writeText(activationCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS). The selectable code
      // rendered above remains a usable fallback.
    }
  };

  const copyLink = async () => {
    if (!loginUrl) return;
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS). The selectable link
      // rendered above remains a usable fallback.
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="New business"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-inter text-lg font-bold text-primary-text">New business</h2>
            <p className="mt-0.5 text-[11px] text-muted-text">
              Creates a new business workspace. The owner information will be available in the Admin panel.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-card hover:text-primary-text"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
              Business name
            </span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="e.g. Mwaicreates"
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-violet-500/60"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
              Currency
            </span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500/60"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
              Owner name
            </span>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="e.g. John Doe"
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-violet-500/60"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
              Owner email
            </span>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="e.g. john@example.com"
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-violet-500/60"
            />
          </label>
        </div>

          {error ? (
            <p role="alert" className="text-[11px] font-medium leading-relaxed text-orange">
              {error}
            </p>
          ) : null}

          {success ? (
            <div role="status" className="space-y-2.5">
              <p className="text-[11px] font-medium leading-relaxed text-green">{success}</p>
              {activationCode ? (
                <>
                  <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
                      Owner email
                    </span>
                    <code className="block break-all text-[11px] leading-relaxed text-primary-text">
                      {ownerEmail}
                    </code>
                  </div>
                  <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
                      Activation code
                    </span>
                    <code className="block break-all text-sm font-semibold leading-relaxed text-primary-text">
                      {activationCode}
                    </code>
                    <span className="mt-1 block text-[10px] leading-relaxed text-muted-text">
                      Single use · expires in 7 days. The owner signs in with their business email
                      and this code.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    disabled={copiedCode}
                    className="h-9 w-full rounded-xl bg-blue text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue/60 disabled:opacity-60"
                  >
                    {copiedCode ? "Copied!" : "Copy Code"}
                  </button>
                  {loginUrl ? (
                    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
                        Owner login
                      </span>
                      <code className="block break-all text-[11px] leading-relaxed text-primary-text">
                        {loginUrl}
                      </code>
                      <span className="mt-1 block text-[10px] leading-relaxed text-muted-text">
                        Send this link to the owner along with their activation code.
                      </span>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    disabled={copiedLink || !loginUrl}
                    className="h-9 w-full rounded-xl border border-border text-xs font-semibold text-secondary-text transition-colors hover:bg-card hover:text-primary-text disabled:opacity-60"
                  >
                    {copiedLink ? "Copied!" : "Copy Login Link"}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            {success ? (
              <button
                type="button"
                onClick={onClose}
                className="h-10 flex-1 rounded-xl bg-blue text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue/60"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 flex-1 rounded-xl border border-border text-xs font-semibold text-secondary-text transition-colors hover:bg-card hover:text-primary-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy}
                  className="h-10 flex-1 rounded-xl bg-blue text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue/60 disabled:opacity-50"
                >
                  {busy ? "Creating…" : "Create business"}
                </button>
              </>
            )}
          </div>
        </div>
    </div>
  );
}