"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme, ThemePreference } from "@/components/theme/ThemeProvider";
import { useDashboardData } from "@/lib/dashboardData";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { CURRENCIES } from "@/lib/currency";
import { describeRateAge } from "@/lib/exchangeRates";
import { SunIcon, MoonIcon, DeviceIcon, CheckIcon, ChevronRightIcon, XIcon } from "./icons";
import { CloudAccountCard } from "./CloudAccountCard";

const PROFILE_KEY = "profile";

interface UserProfile {
  name: string;
  email: string;
}

const DEFAULT_PROFILE: UserProfile = { name: "", email: "" };
const profileCache = new Map<string, UserProfile>();
let cachedProfileUserId: string | null = null;

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string; icon: typeof SunIcon }> = [
  { id: "light", label: "Light", icon: SunIcon },
  { id: "dark", label: "Dark", icon: MoonIcon },
  { id: "system", label: "System", icon: DeviceIcon },
];

export function ProfileTab() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { accounts, categories, plannedTransactions, availableYears, currency, baseCurrency, fxState, setCurrency, activeBusiness } =
    useDashboardData();

  const [profile, setProfile] = useState<UserProfile>(() =>
    cachedProfileUserId ? profileCache.get(cachedProfileUserId) ?? DEFAULT_PROFILE : DEFAULT_PROFILE
  );
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(() =>
    cachedProfileUserId ? !profileCache.has(cachedProfileUserId) : true
  );
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [greeting, setGreeting] = useState("");
  const profileRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++profileRequest.current;
    const isCurrentRequest = () => !cancelled && requestId === profileRequest.current;
    (async () => {
      const client = getSupabaseBrowserClient();
      if (!client) {
        setProfile(loadFromStorage(PROFILE_KEY, DEFAULT_PROFILE));
        setProfileLoading(false);
        return;
      }
      if (!isCurrentRequest()) return;
      const { data: auth } = await client.auth.getUser();
      const uid = auth?.user?.id;
      const email = auth?.user?.email ?? "";
      if (!isCurrentRequest()) return;
      if (uid) {
        const cachedProfile = profileCache.get(uid);
        if (cachedProfileUserId !== uid) {
          cachedProfileUserId = uid;
          setProfile(cachedProfile ?? DEFAULT_PROFILE);
          setProfileLoading(!cachedProfile);
          setProfileError(null);
          setProfileSaved(false);
        }
        if (cachedProfile) {
          setProfile(cachedProfile);
          setProfileLoading(false);
          return;
        }
        const prof = await client.from("profiles").select("email,full_name").eq("id", uid).maybeSingle();
        if (!isCurrentRequest()) return;
        if (prof.error) {
          setProfileError("Could not load your profile.");
          setProfileLoading(false);
          return;
        }
        const name = typeof prof.data?.full_name === "string" ? prof.data.full_name : "";
        const profileEmail = typeof prof.data?.email === "string" ? prof.data.email : email;
        const loadedProfile = { name, email: profileEmail };
        profileCache.set(uid, loadedProfile);
        cachedProfileUserId = uid;
        setProfile(loadedProfile);
        setProfileLoading(false);
      } else {
        setProfileError("Your session could not be verified.");
        setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    const client = getSupabaseBrowserClient();
    if (!client) {
      saveToStorage(PROFILE_KEY, profile);
      setProfileSaved(true);
      setSavingProfile(false);
      return;
    }

    const { data: auth, error: authError } = await client.auth.getUser();
    const uid = auth.user?.id;
    if (authError || !uid) {
      setProfileError("Your session has expired. Please sign in again.");
      setSavingProfile(false);
      return;
    }

    const nextEmail = profile.email.trim().toLowerCase();
    const { error: emailError } =
      nextEmail !== (auth.user.email ?? "").trim().toLowerCase()
        ? await client.auth.updateUser({ email: nextEmail })
        : { error: null };
    if (emailError) {
      setProfileError("Could not update your email.");
      setSavingProfile(false);
      return;
    }

    const { error: profileError } = await client
      .from("profiles")
      .update({ full_name: profile.name.trim(), email: nextEmail })
      .eq("id", uid);
    if (profileError) {
      console.error("Business profile update failed.", {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
      });
      setProfileError("Could not save your profile.");
      setSavingProfile(false);
      return;
    }

    setProfile({ name: profile.name.trim(), email: nextEmail });
    profileCache.set(uid, { name: profile.name.trim(), email: nextEmail });
    cachedProfileUserId = uid;
    setProfileSaved(true);
    setSavingProfile(false);
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const activeCurrency = CURRENCIES.find((c) => c.code === currency) ?? CURRENCIES[1];

  const fxLine = useMemo(() => {
    const age = fxState.updatedAt ? describeRateAge(fxState.updatedAt) : null;
    const from = fxState.from || baseCurrency;
    const to = fxState.to || currency;
    if (fxState.status === "loading") return "Updating currency…";
    if (fxState.status === "ready") {
      return age ? `Currency updated ${from} → ${to} · rates ${age}` : `Currency updated ${from} → ${to}`;
    }
    if (fxState.status === "stale" || fxState.status === "partial" || fxState.status === "error") {
      return age
        ? `Rates unavailable — using last successful rate (${age})`
        : "Rates unavailable — using last successful rate";
    }
    return age ? `Exchange rates · updated ${age}` : `Exchange rates · base currency ${baseCurrency}`;
  }, [fxState, baseCurrency, currency]);

  const initials =
    profile.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div className="space-y-3 md:space-y-4">
      <header className="mb-4 md:mb-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-text">
          Profile
        </p>
        <h1 className="mt-1 text-3xl font-semibold leading-none text-primary-text md:text-4xl">
          {greeting
            ? `${greeting}${profile.name.trim() ? `, ${profile.name.trim()}` : ""}`
            : "Welcome"}
        </h1>
        <p className="mt-1.5 text-xs text-secondary-text">Profile, preferences and appearance</p>
      </header>

      <div className="flex flex-col gap-3 lg:gap-4 lg:flex-row lg:items-start">
        <div className="w-full space-y-3 lg:w-[40%] lg:space-y-4">
          <section className="rounded-2xl border border-border bg-surface p-3.5 md:p-5">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue to-teal text-lg font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                {profileLoading ? (
                  <>
                    <div className="h-4 w-32 animate-pulse rounded bg-card" />
                    <div className="mt-1.5 h-3 w-40 animate-pulse rounded bg-card" />
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-primary-text">
                      {profile.name || "Your name"}
                    </p>
                    <p className="truncate text-[11px] text-muted-text">
                      {profile.email || "you@example.com"}
                    </p>
                  </>
                )}
              </div>
              <span className="rounded-full bg-card px-2.5 py-1 text-[10px] font-medium text-secondary-text">
                {resolvedTheme === "dark" ? "Dark mode" : "Light mode"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
                  Name
                </span>
                {profileLoading ? (
                  <div className="h-10 w-full animate-pulse rounded-xl border border-border bg-card" />
                ) : (
                  <input
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    placeholder="Your name"
                    className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60"
                  />
                )}
              </div>
              <div className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-secondary-text">
                  Email
                </span>
                {profileLoading ? (
                  <div className="h-10 w-full animate-pulse rounded-xl border border-border bg-card" />
                ) : (
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    placeholder="you@example.com"
                    className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-primary-text outline-none transition-colors placeholder:text-muted-text focus-visible:ring-2 focus-visible:ring-blue/60"
                  />
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void saveProfile()}
                disabled={savingProfile || profileLoading}
                className="inline-flex h-9 items-center rounded-xl bg-blue px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-blue/60 disabled:opacity-60"
              >
                {savingProfile ? "Saving…" : "Save"}
              </button>
              {profileSaved ? <span role="status" className="text-xs text-green">Saved</span> : null}
              {profileError ? <span role="alert" className="text-xs text-orange">{profileError}</span> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-3.5 md:p-5">
            <h2 className="text-sm font-semibold text-primary-text">Account</h2>
            <p className="mt-0.5 text-[11px] text-muted-text">
              {activeBusiness
                ? "Synced to your business workspace."
                : "Your data lives locally in this dashboard."}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-2">
              {[
                { label: "Accounts", value: String(accounts.length) },
                { label: "Categories", value: String(categories.length) },
                { label: "Planned items", value: String(plannedTransactions.length) },
                { label: "Data years", value: availableYears.join(", ") || "—" },
              ].map((row) => (
                <div key={row.label} className="rounded-xl border border-border/70 bg-card/50 px-3 py-2.5">
                  <dt className="text-[9px] font-semibold uppercase tracking-wider text-muted-text">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-primary-text">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="w-full space-y-3 lg:w-[60%] lg:space-y-4">
          <section className="rounded-2xl border border-border bg-surface p-3.5 md:p-5">
            <h2 className="text-sm font-semibold text-primary-text">Preferences</h2>
            <p className="mt-0.5 text-[11px] text-muted-text">
              Set the display currency for all amounts.
            </p>
            <button
              type="button"
              onClick={() => setCurrencyOpen(true)}
              aria-haspopup="dialog"
              className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-light-border focus-visible:ring-2 focus-visible:ring-blue/60"
            >
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-text">
                  Currency
                </span>
                <span className="mt-0.5 block truncate text-sm font-medium text-primary-text">
                  {activeCurrency.code} — {activeCurrency.name}
                </span>
              </span>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-text" />
            </button>
            <p
              role="status"
              aria-live="polite"
              className={`mt-2 flex items-center gap-1.5 text-[10px] leading-relaxed ${
                fxState.status === "loading" ||
                fxState.status === "stale" ||
                fxState.status === "error" ||
                fxState.status === "partial"
                  ? "font-medium text-secondary-text"
                  : "text-muted-text"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                  fxState.status === "loading"
                    ? "animate-pulse bg-blue"
                    : fxState.status === "ready"
                      ? "bg-green"
                      : fxState.status === "stale" || fxState.status === "error" || fxState.status === "partial"
                        ? "bg-orange"
                        : "bg-muted-text/60"
                }`}
              />
              {fxLine}
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-3.5 md:p-5">
            <h2 className="text-sm font-semibold text-primary-text">Appearance</h2>
            <p className="mt-0.5 text-[11px] text-muted-text">
              Choose light, dark, or match your system.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-card p-1.5">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTheme(opt.id)}
                    aria-pressed={isActive}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue/60 ${
                      isActive
                        ? "bg-blue text-white"
                        : "text-secondary-text hover:bg-light-border hover:text-primary-text"
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={isActive ? 2.2 : 1.8} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          <CloudAccountCard />
        </div>
      </div>

      <p className="pb-2 pt-4 text-center text-[10px] text-muted-text">
        Budgeting System · personal finance dashboard
      </p>

      {currencyOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Choose currency"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCurrencyOpen(false);
          }}
        >
          <div className="modal-sheet w-full max-w-md rounded-t-3xl border border-border bg-surface shadow-xl sm:rounded-3xl">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-light-border px-4 pb-3 pt-4">
              <h2 className="text-xl font-semibold text-primary-text">Choose Currency</h2>
              <button
                type="button"
                onClick={() => setCurrencyOpen(false)}
                aria-label="Close currency picker"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-text transition-colors hover:bg-card hover:text-primary-text focus-visible:ring-2 focus-visible:ring-blue/60"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </header>
            <ul className="modal-body py-1">
              {CURRENCIES.map((c) => {
                const isActive = c.code === currency;
                return (
                  <li key={c.code}>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrency(c.code);
                        setCurrencyOpen(false);
                      }}
                      aria-current={isActive ? "true" : undefined}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue/60 ${
                        isActive ? "bg-card" : ""
                      }`}
                    >
                      <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-primary-text">
                        {c.symbol}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${isActive ? "font-semibold text-blue" : "font-medium text-primary-text"}`}>
                          {c.code}
                        </span>
                        <span className="block truncate text-[11px] text-muted-text">{c.name}</span>
                      </span>
                      {isActive ? (
                        <CheckIcon className="h-4 w-4 shrink-0 text-green" strokeWidth={2.4} />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <footer className="shrink-0 border-t border-light-border pb-[max(env(safe-area-inset-bottom),0.6rem)] pt-2 text-center text-[10px] text-muted-text">
              Applied everywhere amounts are shown · real FX rates · saved on this device
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}