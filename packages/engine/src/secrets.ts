import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  allWatchedFiles,
  HUNK_HEADER,
  isGitRepo,
  isWatched,
  untrackedPaths,
} from "./fingerprint.ts";
import { GIT_OUTPUT_BYTES, readRegular } from "./fs.ts";
import { quotedText } from "./quote.ts";
import type { Profile } from "./types.ts";

export interface Finding {
  source: string;
  line: number;
  rule: string;
}

const RULES: { rule: string; pattern: RegExp; generic?: boolean }[] = [
  {
    rule: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/,
  },
  { rule: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16,}\b/ },
  {
    rule: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  },
  { rule: "Stripe key", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { rule: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { rule: "Anthropic key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { rule: "OpenAI key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { rule: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    rule: "generic secret assignment",
    pattern:
      /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{16,}['"]/i,
    generic: true,
  },
];

const PLACEHOLDER = /example|placeholder|your[_-]|xxx|changeme|dummy|<[^>]+>/i;
export const MAX_BYTES = 1024 * 1024;

export function scanText(text: string, source: string): Finding[] {
  const findings: Finding[] = [];
  text.split("\n").forEach((line, index) => {
    for (const { rule, pattern, generic } of RULES) {
      if (generic && PLACEHOLDER.test(line)) continue;
      if (pattern.test(line)) {
        findings.push({ source, line: index + 1, rule });
        break;
      }
    }
  });
  return findings;
}

export function isBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

export interface ScanSource {
  source: string;
  text: string;
}

/** One added line of the change (2026-10-29-001, the security lead's R-1): its file, its line number in the new file, its text. */
export interface AddedLine {
  file: string;
  line: number;
  text: string;
}
/** A file the per-line reading did not read, and why: never counted clean. */
export interface SkippedFile {
  file: string;
  reason: "binary" | "over cap";
}

/** How the change was read: from the base's diff, every watched file whole (no usable diff), or not at all (no diff and a tree over the walk's cap). */
export type ChangeMode =
  | { kind: "diff" }
  | { kind: "whole tree"; why: string }
  | { kind: "unreadable"; why: string };

/** The change as one reading serves both scans: each file's added lines, the untracked files read whole, the skipped with why, the tracked files whose added text is over the cap. */
interface ChangeReading {
  mode: ChangeMode;
  tracked: Map<string, AddedLine[]>;
  untracked: Map<string, AddedLine[]>;
  overCap: Set<string>;
  skipped: SkippedFile[];
}

/** A path from a diff header, C-unquoted as git writes a name with unusual characters: `\"`, `\\`, `\t`, `\n` and octal bytes. */
function diffPath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const bytes: number[] = [];
  const body = raw.slice(1, -1);
  const named: Record<string, number> = {
    t: 9,
    n: 10,
    r: 13,
    a: 7,
    b: 8,
    f: 12,
    v: 11,
    '"': 34,
    "\\": 92,
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i] as string;
    if (c !== "\\") {
      bytes.push(...Buffer.from(c, "utf8"));
      continue;
    }
    const next = body[i + 1] ?? "";
    const octal = /^[0-7]{3}/.exec(body.slice(i + 1));
    if (octal) {
      bytes.push(Number.parseInt(octal[0], 8));
      i += 3;
    } else {
      bytes.push(named[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/** A header's path without its `a/` or `b/` prefix (git ends a name holding a space with a tab). */
function headerPath(raw: string): string | null {
  const target = raw.replace(/\t$/, "");
  return target === "/dev/null" ? null : diffPath(target).replace(/^[ab]\//, "");
}

/** Lines numbered from 1, the trailing empty line of a final newline dropped. */
function numbered(path: string, text: string): AddedLine[] {
  const lines = text.split("\n").map((t, i) => ({ file: path, line: i + 1, text: t }));
  if (lines.length && lines[lines.length - 1]?.text === "") lines.pop();
  return lines;
}

/**
 * Reads the change once for the secret scan and the prose scan (2026-10-29-001; the code-quality
 * defect at round 1). With a base and git: the base's diff, parsed per file, a `+++ ` taken as a
 * header only inside a file's header block (after `diff --git` and before its first `@@`), so an
 * added line that starts with `++` is a line; every untracked file `keepUntracked` accepts read
 * whole as a regular file under the cap. Without a usable diff: every watched file whole, or, over
 * the walk's cap, nothing and the reason, never a clean count.
 */
function readChange(
  root: string,
  profile: Profile,
  base: string | null,
  keepUntracked: (path: string) => boolean,
): ChangeReading {
  const reading: ChangeReading = {
    mode: { kind: "diff" },
    tracked: new Map(),
    untracked: new Map(),
    overCap: new Set(),
    skipped: [],
  };
  const whole = (path: string, into: Map<string, AddedLine[]>) => {
    const buffer = readRegular(join(root, path), MAX_BYTES);
    if (buffer === null) return;
    if (buffer === "over cap") reading.skipped.push({ file: path, reason: "over cap" });
    else if (isBinary(buffer)) reading.skipped.push({ file: path, reason: "binary" });
    else into.set(path, numbered(path, buffer.toString("utf8")));
  };
  const everything = (why: string) => {
    const files = allWatchedFiles(root, profile);
    if (files === null) {
      reading.mode = { kind: "unreadable", why: `${why}, and the tree is over the walk's cap` };
      return reading;
    }
    reading.mode = { kind: "whole tree", why };
    for (const path of files) if (keepUntracked(path)) whole(path, reading.untracked);
    return reading;
  };
  if (base === null) return everything("no base commit");
  if (!isGitRepo(root)) return everything("no git repository");
  let diff: string | null;
  try {
    diff = execFileSync(
      "git",
      [
        "-c",
        "core.quotePath=false",
        "diff",
        base,
        "--no-renames",
        "--unified=0",
        "--no-color",
        "--",
        ".",
      ],
      {
        cwd: root,
        env: process.env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: GIT_OUTPUT_BYTES,
      },
    );
  } catch {
    diff = null;
  }
  const untracked = untrackedPaths(root);
  if (diff === null || untracked === null) return everything("the base's diff could not be read");
  let file: string | null = null;
  let inHeader = false;
  let next = 0;
  let size = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      inHeader = true;
      file = null;
      size = 0;
      continue;
    }
    if (inHeader) {
      if (raw.startsWith("+++ ")) file = headerPath(raw.slice(4));
      const binary = /^Binary files .* and (.+) differ$/.exec(raw);
      if (binary) {
        const target = headerPath(binary[1] ?? "");
        if (target !== null) reading.skipped.push({ file: target, reason: "binary" });
        file = null;
      }
      if (!raw.startsWith("@@")) continue;
      inHeader = false;
    }
    const hunk = HUNK_HEADER.exec(raw);
    if (hunk) {
      next = Number(hunk[1]);
      continue;
    }
    if (file === null || !raw.startsWith("+")) continue;
    size += raw.length;
    if (size > MAX_BYTES) reading.overCap.add(file);
    const list = reading.tracked.get(file) ?? [];
    list.push({ file, line: next, text: raw.slice(1) });
    reading.tracked.set(file, list);
    next += 1;
  }
  for (const path of [...untracked].sort()) if (keepUntracked(path)) whole(path, reading.untracked);
  return reading;
}

/**
 * Only what this change adds is scanned: added lines of tracked files, and untracked files whole.
 * With a base commit the change starts there, so a secret committed during the work is still found.
 * Every added line is scanned, whatever its size, and a line that starts with `++` is a line. The
 * sources alone, as the scan read them before 2026-10-29-001: kept as the contract the secret
 * scan's older rows read (AC-11 keeps them as they are); `scanSecrets` reads `changeSources`.
 */
export function changedText(
  root: string,
  profile: Profile,
  base: string | null = "HEAD",
): ScanSource[] {
  return changeSources(root, profile, base).sources;
}

/** The secret scan's sources with how the change was read and what the reading skipped (2026-10-29-001, AC-16). */
function changeSources(
  root: string,
  profile: Profile,
  base: string | null,
): { sources: ScanSource[]; mode: ChangeMode; skipped: SkippedFile[] } {
  const reading = readChange(root, profile, base, (path) => isWatched(path, profile));
  const sources: ScanSource[] = [];
  const added = [...reading.tracked.keys()]
    .sort()
    .flatMap((path) => (reading.tracked.get(path) ?? []).map((l) => l.text))
    .join("\n");
  if (added && base !== null)
    sources.push({ source: `git diff ${base.slice(0, 12)} (added lines)`, text: added });
  for (const path of [...reading.untracked.keys()].sort())
    sources.push({
      source: path,
      text: (reading.untracked.get(path) ?? []).map((l) => l.text).join("\n"),
    });
  const skipped = [...reading.skipped].sort((a, b) => a.file.localeCompare(b.file));
  return { sources, mode: reading.mode, skipped };
}

/**
 * The change's added lines, per file and per line (2026-10-29-001, P-5), for the files `keep`
 * accepts, tracked and untracked alike: a binary file, or one whose added text is over the scan's
 * cap, is skipped and named; how the change was read is said, so a scan that read nothing never
 * reads as clean.
 */
export function addedLines(
  root: string,
  profile: Profile,
  base: string | null = "HEAD",
  keep: (path: string) => boolean = (path) => isWatched(path, profile),
): { lines: AddedLine[]; skipped: SkippedFile[]; mode: ChangeMode } {
  const reading = readChange(root, profile, base, keep);
  const lines: AddedLine[] = [];
  const skipped = reading.skipped.filter((s) => keep(s.file));
  for (const path of [...reading.overCap].sort())
    if (keep(path)) skipped.push({ file: path, reason: "over cap" });
  const files = new Map([...reading.tracked, ...reading.untracked]);
  for (const path of [...files.keys()].sort()) {
    if (!keep(path) || reading.overCap.has(path)) continue;
    lines.push(...(files.get(path) ?? []));
  }
  skipped.sort((a, b) => a.file.localeCompare(b.file));
  return { lines, skipped, mode: reading.mode };
}

/** Optional second opinion. An older gitleaks without the `stdin` command exits 1 with a usage error, so a leak needs the word in the output too. */
function gitleaks(text: string): { ran: boolean; leaked: boolean; tail: string } {
  const result = spawnSync("gitleaks", ["stdin", "--no-banner", "--redact", "--exit-code", "1"], {
    input: text,
    encoding: "utf8",
  });
  if (result.error || result.status === null || (result.status !== 0 && result.status !== 1))
    return { ran: false, leaked: false, tail: "" };
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status === 1 && !/leak/i.test(output)) return { ran: false, leaked: false, tail: "" };
  return {
    ran: true,
    leaked: result.status === 1,
    tail: output.trim().split("\n").slice(-20).join("\n"),
  };
}

/**
 * The secret scan over the change. A change it could not read (no diff and a tree over the walk's
 * cap) is `unavailable` with the reason, never a clean pass; each file the reading skipped is
 * named after the verdict (2026-10-29-001, AC-16). Every added line is scanned whatever its size.
 */
export async function scanSecrets(
  root: string,
  profile: Profile,
  base: string | null = "HEAD",
): Promise<{
  status: "pass" | "fail" | "unavailable";
  findings: Finding[];
  tail: string;
  usedGitleaks: boolean;
}> {
  const { sources, mode, skipped } = changeSources(root, profile, base);
  if (mode.kind === "unreadable")
    return {
      status: "unavailable",
      findings: [],
      tail: `the change could not be read: ${mode.why}`,
      usedGitleaks: false,
    };
  const findings = sources.flatMap((s) => scanText(s.text, s.source));
  // A source can be an untracked file's own name: quoted, as every name in the tail is.
  const lines = findings.map((f) => `${quotedText(f.source)}:${f.line}: ${f.rule}`);
  const extra = gitleaks(sources.map((s) => s.text).join("\n"));
  if (extra.ran && extra.leaked) lines.push("gitleaks:", extra.tail);
  const status = findings.length === 0 && !(extra.ran && extra.leaked) ? "pass" : "fail";
  const verdict = lines.join("\n") || "no secrets found in the change";
  const named = skipped.map((s) => `skipped ${quotedText(s.file)} (${s.reason})`);
  return {
    status,
    findings,
    tail: [verdict, ...named].join("\n"),
    usedGitleaks: extra.ran,
  };
}
