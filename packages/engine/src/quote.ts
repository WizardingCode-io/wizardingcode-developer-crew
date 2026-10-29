// How the engine quotes text a page, a file or a change wrote: one line, no control characters,
// capped. A module with no imports, so the scans (secrets.ts, prose.ts) and the UI evidence share
// one rule without importing each other (2026-10-29-001).

export const SAFE_TEXT_MAX = 120;

/** Text a page or a file wrote, as the report quotes it (2026-10-29-001, the security lead's R-3): `safeText`'s rule, with C1 controls, zero-width and bidi characters stripped too, cut at 120. */
export function quotedText(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return safeText(text.replace(/[\u0080-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ""));
}

/** One line of safe text from a file's string: the first line, no control characters, capped with an ellipsis. */
export function safeText(value: unknown, max = SAFE_TEXT_MAX): string {
  const text = value === null || value === undefined ? "" : String(value);
  const line = text.split(/\r?\n/)[0] ?? "";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is stripped
  const clean = line.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
