// ============================================================
// Centralized currency support
//
// The app stores amounts in a single base value set (no multi-currency
// conversion). The selected currency is therefore the *display/account*
// currency: every amount in the dataset is formatted consistently in it.
// No fake exchange rates are invented anywhere.
// ============================================================

export interface CurrencyDef {
  code: string;
  name: string;
  symbol: string;
  /** Number of fraction digits (JPY uses 0). */
  decimals: number;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", decimals: 0 },
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 0 },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh", decimals: 0 },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", decimals: 0 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
];

export type CurrencyCode = string;

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

/** Module-level active currency so legacy formatter call sites stay
 *  currency-aware without threading a parameter through every component.
 *  The DashboardProvider keeps this in sync on every render. */
let activeCurrency: CurrencyCode = DEFAULT_CURRENCY;

export function setActiveCurrency(code: CurrencyCode) {
  activeCurrency = BY_CODE.has(code) ? code : DEFAULT_CURRENCY;
}

export function getActiveCurrency(): CurrencyDef {
  return BY_CODE.get(activeCurrency) ?? BY_CODE.get(DEFAULT_CURRENCY)!;
}

export function getCurrency(code: CurrencyCode): CurrencyDef {
  return BY_CODE.get(code) ?? BY_CODE.get(DEFAULT_CURRENCY)!;
}

function group(n: number, decimals: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Currency-sign symbols attach directly to the number ($12,500.00, €12,500.00,
 * £12,500.00, ¥12,500). Alphabetic / multi-char symbols use a space (KSh 12,500,
 * CA$ 1,250.00, R 1,250.00). This keeps display faithful to each currency.
 */
const TIGHT_SYMBOLS = new Set(["$", "€", "£", "¥"]);

function symbolSeparator(symbol: string): string {
  return TIGHT_SYMBOLS.has(symbol) ? "" : " ";
}

/** Full formatting: "$12,500.00" / "KSh 12,500" / "-€1,250.00". */
export function formatCurrencyFull(amount: number, code?: CurrencyCode): string {
  const c = code ? getCurrency(code) : getActiveCurrency();
  const sign = amount < 0 ? "-" : "";
  return `${sign}${c.symbol}${symbolSeparator(c.symbol)}${group(Math.abs(amount), c.decimals)}`;
}

/** Compact formatting for charts/rows: "KSh 45k" / "$1.2M". */
export function formatCurrencyCompact(amount: number, code?: CurrencyCode): string {
  const c = code ? getCurrency(code) : getActiveCurrency();
  const sign = amount < 0 ? "-" : "";
  const v = Math.abs(amount);
  let body: string;
  if (v >= 1_000_000) body = `${(v / 1_000_000).toFixed(1)}M`;
  else if (v >= 1_000) body = `${(v / 1_000).toFixed(1)}k`;
  else body = v.toFixed(c.decimals);
  return `${sign}${c.symbol}${symbolSeparator(c.symbol)}${body}`;
}
