import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allWatchedFiles, isGitRepo, isWatched } from "./fingerprint.ts";
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
const MAX_BYTES = 1024 * 1024;

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

function fileSource(root: string, path: string): ScanSource | null {
  let buffer: Buffer;
  try {
    buffer = readFileSync(join(root, path));
  } catch {
    return null;
  }
  if (buffer.length > MAX_BYTES || isBinary(buffer)) return null;
  return { source: path, text: buffer.toString("utf8") };
}

function untrackedPaths(root: string): string[] {
  try {
    return execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\0")
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

/** Only what this change adds is scanned: added lines of tracked files, and untracked files whole. */
export function changedText(root: string, profile: Profile): ScanSource[] {
  const sources: ScanSource[] = [];
  if (!isGitRepo(root)) {
    // Above the walk's cap there is nothing to scan; the verdict already says the fingerprint is unavailable.
    for (const path of allWatchedFiles(root, profile) ?? []) {
      const source = fileSource(root, path);
      if (source) sources.push(source);
    }
    return sources;
  }
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "HEAD", "--unified=0", "--no-color", "--", "."], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    diff = "";
  }
  const added = diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .join("\n");
  if (added) sources.push({ source: "git diff HEAD (added lines)", text: added });
  for (const path of untrackedPaths(root)) {
    if (!isWatched(path, profile)) continue;
    const source = fileSource(root, path);
    if (source) sources.push(source);
  }
  return sources;
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

export async function scanSecrets(
  root: string,
  profile: Profile,
): Promise<{ status: "pass" | "fail"; findings: Finding[]; tail: string; usedGitleaks: boolean }> {
  const sources = changedText(root, profile);
  const findings = sources.flatMap((s) => scanText(s.text, s.source));
  const lines = findings.map((f) => `${f.source}:${f.line}: ${f.rule}`);
  const extra = gitleaks(sources.map((s) => s.text).join("\n"));
  if (extra.ran && extra.leaked) lines.push("gitleaks:", extra.tail);
  const status = findings.length === 0 && !(extra.ran && extra.leaked) ? "pass" : "fail";
  return {
    status,
    findings,
    tail: lines.join("\n") || "no secrets found in the change",
    usedGitleaks: extra.ran,
  };
}
