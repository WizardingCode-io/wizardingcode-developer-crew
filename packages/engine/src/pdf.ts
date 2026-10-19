/**
 * The PDF of a report (SP7 §13.2, SP8 decision 8): printed by the project's own Playwright,
 * resolved from the root alone, else by a browser on the machine, every word quoted and the run
 * bounded by a timeout; when neither prints, the reason is returned and never hidden.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { joinWords, runCommand } from "./run.ts";

export const NO_PDF =
  "PDF not produced: no Playwright in the project and no browser found (set WIZARDINGCODE_CREW_BROWSER)";

/** The browsers looked for after the variable: on PATH by name, then the macOS application paths. */
export const BROWSER_CANDIDATES: readonly string[] = [
  "google-chrome",
  "chromium",
  "chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

/** The engine's own timer fired: told by its type, never by the words of a Playwright error (finding 102). */
class PdfTimeout extends Error {}

export interface PdfOptions {
  timeoutMs?: number;
  /** Where the browser's output goes; a temporary file by default. */
  logPath?: string;
  /** The browsers looked for after the variable; a test narrows it. */
  candidates?: readonly string[];
}

function onPath(binary: string, env: NodeJS.ProcessEnv): string | null {
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const path = join(dir, binary);
    if (existsSync(path)) return path;
  }
  return null;
}

/** The browser named by `WIZARDINGCODE_CREW_BROWSER`, else the first candidate found; null when none. */
export function findBrowser(
  env: NodeJS.ProcessEnv,
  candidates: readonly string[] = BROWSER_CANDIDATES,
): string | null {
  const named = env.WIZARDINGCODE_CREW_BROWSER?.trim();
  if (named) return named;
  for (const candidate of candidates) {
    const found = candidate.includes("/")
      ? existsSync(candidate)
        ? candidate
        : null
      : onPath(candidate, env);
    if (found) return found;
  }
  return null;
}

interface PlaywrightLike {
  chromium: {
    launch(): Promise<{
      newPage(): Promise<{
        goto(url: string): Promise<unknown>;
        pdf(options: { path: string; format: string; printBackground: boolean }): Promise<unknown>;
      }>;
      close(): Promise<void>;
    }>;
  };
}

/** The project's own Playwright, resolved from the root and nowhere else; null when it has none. */
function projectPlaywright(root: string): PlaywrightLike | null {
  const require = createRequire(`${root}/`);
  for (const name of ["playwright", "@playwright/test"]) {
    try {
      const mod = require(name) as Partial<PlaywrightLike>;
      if (mod?.chromium) return mod as PlaywrightLike;
    } catch {
      // not installed here
    }
  }
  return null;
}

async function printWithPlaywright(pw: PlaywrightLike, html: string, out: string): Promise<void> {
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file://${html}`);
    await page.pdf({ path: out, format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
}

function seconds(ms: number): string {
  return `${ms / 1000} s`;
}

/**
 * Prints `html` to `out`: Playwright from the root under the timeout, else a browser through the
 * engine's runner with its words quoted. Returns who printed, or why nothing was printed.
 */
export async function printPdf(
  html: string,
  out: string,
  env: NodeJS.ProcessEnv,
  root: string,
  options: PdfOptions = {},
): Promise<{ ok: true; by: string } | { ok: false; reason: string }> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const playwright = projectPlaywright(root);
  if (playwright) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new PdfTimeout(`timed out after ${seconds(timeoutMs)}`)),
        timeoutMs,
      );
    });
    try {
      await Promise.race([printWithPlaywright(playwright, html, out), timeout]);
      return { ok: true, by: "playwright" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const why = error instanceof PdfTimeout ? message : `failed: ${message}`;
      return { ok: false, reason: `PDF not produced: Playwright ${why}` };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const browser = findBrowser(env, options.candidates);
  if (!browser) return { ok: false, reason: NO_PDF };
  const command = joinWords([
    browser,
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${out}`,
    `file://${html}`,
  ]);
  const result = await runCommand(command, {
    cwd: root,
    timeoutMs,
    logPath: options.logPath ?? join(tmpdir(), `crew-pdf-${Date.now()}.log`),
    env,
  });
  if (result.timedOut)
    return {
      ok: false,
      reason: `PDF not produced: the browser timed out after ${seconds(timeoutMs)}`,
    };
  if (result.exit !== 0) {
    const tail = result.tail.trim().split("\n").filter(Boolean).slice(-3).join(" ");
    return { ok: false, reason: `PDF not produced: the browser exited ${result.exit}: ${tail}` };
  }
  if (!existsSync(out))
    return {
      ok: false,
      reason: `PDF not produced: the browser exited 0 and wrote nothing at ${out}`,
    };
  return { ok: true, by: browser };
}
