// Shared CSV cell escaping, including formula-injection neutralization.
//
// A cell opened by Excel/Sheets/LibreOffice that begins with =, +, -, or @
// can execute as a formula rather than display as plain text. Only
// string-typed cells that are NOT a plain numeric literal are guarded (by
// prefixing a leading apostrophe, which spreadsheet apps treat as a
// text marker), so any legitimately formatted amount (e.g. "-1234.56")
// is left byte-for-byte unchanged.
const RISKY_PREFIX = /^[=+\-@]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvEscape(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && RISKY_PREFIX.test(s) && !PLAIN_NUMBER.test(s)) {
    s = `'${s}`;
  }
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(rows: Array<Array<string | number>>): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}
