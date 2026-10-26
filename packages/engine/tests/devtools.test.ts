// The deep audit through the chrome-devtools CLI (SP9 Task 7): a fake `chrome-devtools` on the
// environment's PATH answers each tool with canned JSON and records its calls, so the commands, the
// limits, the files, the grading and the safety are proven without the tool or a Chrome.

import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { detectBrowser, detectProfile, mergeProfile } from "../src/detect/index.ts";
import { AUDIT_DIR, auditPages, runDevtoolsAudit } from "../src/devtools.ts";
import { loadProfile, saveProfile } from "../src/profile.ts";
import type { GateCommand, Profile } from "../src/types.ts";
import { captureMetadata, capturesMeasuredCls, captureUrls } from "../src/ui.ts";
import { addCriterion, createWork } from "../src/work.ts";
import {
  fakeDevtoolsCli as fakeCli,
  DEVTOOLS_INSIGHTS as INSIGHTS,
  makeRepo,
  DEVTOOLS_REPORT as REPORT,
  repoPaths,
  tempDir,
  testEnv,
} from "./helpers.ts";

const confirmed = (command: string): GateCommand => ({ command, source: "confirmed" });

/** An item with a managed environment; `url: null` leaves `environment.url` out (an `undefined` would take the default); `root` for a repository somewhere named. */
function item(
  browser?: { devtools: GateCommand },
  url: string | null = "http://localhost:3000/",
  root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) }),
) {
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "feature");
  addCriterion(work, "x");
  const profile: Profile = {
    version: 1,
    detectedAt: "",
    targets: [],
    watch: { exclude: [] },
    environment: {
      start: confirmed("true"),
      health: confirmed("true"),
      timeoutMs: 1000,
      ...(url ? { url } : {}),
    },
    ...(browser ? { browser } : {}),
  };
  return { root, paths, work, profile };
}

/** An environment with the fake CLI first on PATH and the fixtures named. */
function fakeEnv(dir: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const fixtures = tempDir("crew-devtools-fixtures-");
  writeFileSync(join(fixtures, "report.json"), JSON.stringify(REPORT));
  writeFileSync(join(fixtures, "insights.json"), JSON.stringify(INSIGHTS));
  return {
    ...testEnv(),
    PATH: `${dir}:/usr/bin:/bin`,
    FAKE_CALLS: join(fixtures, "calls.txt"),
    FAKE_REPORT: join(fixtures, "report.json"),
    FAKE_INSIGHTS: join(fixtures, "insights.json"),
    ...extra,
  };
}

const calls = (env: NodeJS.ProcessEnv): string[] =>
  existsSync(env.FAKE_CALLS ?? "")
    ? readFileSync(env.FAKE_CALLS ?? "", "utf8")
        .trim()
        .split("\n")
    : [];

async function audit(
  options: Partial<Parameters<typeof runDevtoolsAudit>[0]> & {
    paths: ReturnType<typeof repoPaths>;
    work: ReturnType<typeof createWork>;
    profile: Profile;
    env: NodeJS.ProcessEnv;
  },
) {
  return runDevtoolsAudit({
    pages: auditPages(options.profile.environment?.url, []),
    fixtureMeasuredCls: false,
    log: "logs/e2e-test.txt",
    limits: { commandMs: 10_000, totalMs: 60_000 },
    ...options,
  });
}

test("SP9-T7 AC-2: without a confirmed command the audit is not captured with its reason, runs nothing and writes audit.json; a missing or unknown source reads as proposed; no block and no url give the first reason", async () => {
  const { dir } = fakeCli();
  const env = fakeEnv(dir);
  const none = item();
  const absent = await audit({ ...none, env });
  expect(absent.status).toBe("not captured");
  expect(absent.reason).toBe(
    'no chrome-devtools in the profile: npm i -g chrome-devtools-mcp, then crew detect, or crew profile set browser.devtools "<cmd>"',
  );
  expect(absent.lines[0]).toBe(`audit: not captured (${absent.reason})`);
  expect(calls(env)).toEqual([]);
  const file = JSON.parse(
    readFileSync(join(none.paths.crewDir, "work", none.work.id, AUDIT_DIR, "audit.json"), "utf8"),
  ) as { status: string; reason: string };
  expect(file).toMatchObject({ status: "not captured", reason: absent.reason });
  const proposed = item({ devtools: { command: "chrome-devtools", source: "proposed" } });
  expect((await audit({ ...proposed, env })).reason).toBe(
    "chrome-devtools proposed; crew profile confirm browser",
  );
  const odd = item({ devtools: { command: "chrome-devtools", source: "odd" as "proposed" } });
  expect((await audit({ ...odd, env })).reason).toBe(
    "chrome-devtools proposed; crew profile confirm browser",
  );
  const sourceless = item({ devtools: { command: "chrome-devtools" } as GateCommand });
  expect((await audit({ ...sourceless, env })).reason).toBe(
    "chrome-devtools proposed; crew profile confirm browser",
  );
  const noUrl = item({ devtools: confirmed("chrome-devtools") }, null);
  expect((await audit({ ...noUrl, env, pages: [] })).reason).toBe("no environment.url");
  const neither = item(undefined, null);
  expect((await audit({ ...neither, env, pages: [] })).reason).toBe(absent.reason);
  // A failed e2e command: the fourth reason, nothing run.
  const broken = item({ devtools: confirmed("chrome-devtools") });
  expect((await audit({ ...broken, env, e2eFailed: true })).reason).toBe("e2e command failed");
  expect(calls(env)).toEqual([]);
});

test("SP9-T7 AC-3, AC-4: a confirmed audit runs start, new_page, lighthouse_audit, performance_start_trace and stop with the flags, the quoted arguments and the telemetry off, and leaves the engine's files", async () => {
  const { dir } = fakeCli();
  const env = fakeEnv(dir);
  const it = item({ devtools: confirmed("chrome-devtools") });
  const result = await audit({ ...it, env });
  expect(result.status).toBe("captured");
  const folder = join(it.paths.crewDir, "work", it.work.id, AUDIT_DIR);
  const made = calls(env);
  expect(made[0]).toBe(
    "start --headless --isolated --no-usage-statistics --no-performance-crux --output-format=json NOUSAGE=1",
  );
  expect(made[1]).toBe("new_page --url http://localhost:3000/ --output-format=json NOUSAGE=1");
  expect(made[2]).toBe(
    `lighthouse_audit p1 --mode navigation --device mobile --outputDirPath ${folder} --output-format=json NOUSAGE=1`,
  );
  expect(made[3]).toBe(
    `performance_start_trace p1 --reload --autoStop --filePath ${join(folder, "trace-1.json")} --output-format=json NOUSAGE=1`,
  );
  expect(made[4]).toBe("stop NOUSAGE=1");
  expect(made[5]).toBe("stopped");
  expect(readdirSync(folder).sort()).toEqual([
    "audit.json",
    "insights-1.txt",
    "lighthouse-1.json",
    "trace-1.json",
  ]);
  const file = JSON.parse(readFileSync(join(folder, "audit.json"), "utf8")) as Record<
    string,
    unknown
  >;
  expect(Object.keys(file).sort()).toEqual([
    "advisories",
    "at",
    "command",
    "offences",
    "pages",
    "reason",
    "status",
  ]);
  expect(file.pages).toEqual([
    {
      url: "http://localhost:3000/",
      id: "p1",
      lighthouse: {
        file: "lighthouse-1.json",
        scores: { performance: 50, accessibility: 80, bestPractices: 100, seo: 90 },
        failed: [
          {
            id: "color-contrast",
            title: "Background and foreground colors do not have a sufficient contrast ratio.",
            score: 0,
          },
        ],
      },
      trace: { file: "trace-1.json", lcpMs: 1234, cls: 0.18, inpMs: 200 },
      reason: null,
    },
  ]);
  expect(JSON.parse(readFileSync(join(folder, "lighthouse-1.json"), "utf8"))).toEqual(REPORT);
  expect(readFileSync(join(folder, "insights-1.txt"), "utf8").trim()).toBe(
    JSON.stringify(INSIGHTS),
  );
  // The report printed on stdout instead of written gives the same file.
  const printed = item({ devtools: confirmed("chrome-devtools") });
  const envStdout = fakeEnv(dir, { FAKE_LIGHTHOUSE: "stdout" });
  const second = await audit({ ...printed, env: envStdout });
  expect(second.status).toBe("captured");
  expect(
    JSON.parse(
      readFileSync(
        join(printed.paths.crewDir, "work", printed.work.id, AUDIT_DIR, "lighthouse-1.json"),
        "utf8",
      ),
    ),
  ).toEqual(REPORT);
  // Two pages: the files numbered per page.
  const two = item({ devtools: confirmed("chrome-devtools") });
  const envTwo = fakeEnv(dir);
  const both = await audit({
    ...two,
    env: envTwo,
    pages: ["http://localhost:3000/", "http://localhost:3000/checkout"],
  });
  expect(both.pages.map((p) => [p.url, p.lighthouse?.file, p.trace?.file])).toEqual([
    ["http://localhost:3000/", "lighthouse-1.json", "trace-1.json"],
    ["http://localhost:3000/checkout", "lighthouse-2.json", "trace-2.json"],
  ]);
  expect(readdirSync(join(two.paths.crewDir, "work", two.work.id, AUDIT_DIR)).sort()).toEqual([
    "audit.json",
    "insights-1.txt",
    "insights-2.txt",
    "lighthouse-1.json",
    "lighthouse-2.json",
    "trace-1.json",
    "trace-2.json",
  ]);
  // An insights line carrying a control character is stored without it.
  const unsafe = item({ devtools: confirmed("chrome-devtools") });
  const envUnsafe = fakeEnv(dir);
  writeFileSync(envUnsafe.FAKE_INSIGHTS ?? "", `{"cls":0.01} \u001b[31m red`);
  await audit({ ...unsafe, env: envUnsafe });
  expect(
    readFileSync(
      join(unsafe.paths.crewDir, "work", unsafe.work.id, AUDIT_DIR, "insights-1.txt"),
      "utf8",
    ),
  ).not.toContain("\u001b");
  // Insights printed as text lines, not JSON: the metrics read from `LCP: <n> ms`-style lines, as the CLI prints them.
  const textual = item({ devtools: confirmed("chrome-devtools") });
  const envText = fakeEnv(dir);
  writeFileSync(envText.FAKE_INSIGHTS ?? "", "LCP: 1234 ms\nCLS: 0.05\nINP: 80 ms\n");
  expect((await audit({ ...textual, env: envText })).pages[0]?.trace).toEqual({
    file: "trace-1.json",
    lcpMs: 1234,
    cls: 0.05,
    inpMs: 80,
  });
});

test("SP9-T7 AC-3 (the limits and the stop): a hanging or failing tool leaves its page not captured with the reason and stop still runs; a thrown step is caught; start failing ends the audit; the budget leaves a page over", async () => {
  const { dir } = fakeCli();
  const hang = item({ devtools: confirmed("chrome-devtools") });
  const envHang = fakeEnv(dir, { FAKE_LIGHTHOUSE: "hang" });
  const hung = await audit({ ...hang, env: envHang, limits: { commandMs: 500, totalMs: 60_000 } });
  expect(hung.pages[0]?.reason).toBe(
    "lighthouse_audit failed on http://localhost:3000/ (timed out)",
  );
  expect(hung.pages[0]?.lighthouse).toBeNull();
  expect(calls(envHang).at(-1)).toBe("stopped");
  const exit3 = item({ devtools: confirmed("chrome-devtools") });
  const envExit = fakeEnv(dir, { FAKE_LIGHTHOUSE: "exit3" });
  const exited = await audit({ ...exit3, env: envExit });
  expect(exited.pages[0]?.reason).toBe(
    "lighthouse_audit failed on http://localhost:3000/ (exit 3)",
  );
  expect(calls(envExit).at(-1)).toBe("stopped");
  // The trace tool removes the audit folder: the engine's insights write is the first to throw.
  const thrown = item({ devtools: confirmed("chrome-devtools") });
  const envThrow = fakeEnv(dir, { FAKE_TRACE: "rmdir" });
  const caught = await audit({ ...thrown, env: envThrow });
  expect(caught.pages[0]?.reason).toMatch(/^insights-1\.txt: /);
  expect(calls(envThrow).at(-1)).toBe("stopped");
  expect(caught.status).toBe("captured");
  const dead = item({ devtools: confirmed("chrome-devtools") });
  const envDead = fakeEnv(dir, { FAKE_START: "exit1" });
  const ended = await audit({ ...dead, env: envDead });
  expect(ended.status).toBe("not captured");
  expect(ended.reason).toBe("start failed (exit 1)");
  expect(calls(envDead).at(-1)).toBe("stopped");
  // The budget spent after the first page: the second is left over.
  const budget = item({ devtools: confirmed("chrome-devtools") });
  const envBudget = fakeEnv(dir);
  const over = await audit({
    ...budget,
    env: envBudget,
    pages: ["http://localhost:3000/", "http://localhost:3000/two"],
    limits: { commandMs: 10_000, totalMs: 1 },
  });
  expect(over.pages[1]?.reason).toBe("time budget");
  expect(calls(envBudget).at(-1)).toBe("stopped");
  // The audit folder's name taken by a regular file: the record cannot be written and the run
  // answers not captured with the reason, never a throw out of the gate; with a confirmed command
  // the folder cannot be made before `start`, the same answer with that reason.
  const blocked = item();
  const reviewUi = join(blocked.paths.crewDir, "work", blocked.work.id, "review", "ui");
  mkdirSync(reviewUi, { recursive: true });
  writeFileSync(join(reviewUi, "audit"), "not a folder");
  const unwritable = await audit({ ...blocked, env: fakeEnv(dir) });
  expect(unwritable.status).toBe("not captured");
  expect(unwritable.reason).toMatch(/^audit\.json: /);
  expect(unwritable.lines).toEqual([`audit: not captured (${unwritable.reason})`]);
  expect(unwritable.pages).toEqual([]);
  const blockedRun = item({ devtools: confirmed("chrome-devtools") });
  const runUi = join(blockedRun.paths.crewDir, "work", blockedRun.work.id, "review", "ui");
  mkdirSync(runUi, { recursive: true });
  writeFileSync(join(runUi, "audit"), "not a folder");
  const envBlocked = fakeEnv(dir);
  const unmade = await audit({ ...blockedRun, env: envBlocked });
  expect(unmade.status).toBe("not captured");
  expect(unmade.reason).toMatch(/EEXIST|ENOTDIR/);
  expect(calls(envBlocked)).toEqual([]);
});

test("SP9-T7 AC-3 (the pages and the arguments): environment.url first, then the captures' distinct urls, non-http ones as rows with no command, at most five; a url with a shell sequence is quoted whole, an id with one is refused, a quote is refused, and win32 refuses the shell's characters", async () => {
  const { dir } = fakeCli();
  // The page list from the capture metadata.
  const it = item({ devtools: confirmed("chrome-devtools") });
  const ui = join(it.paths.crewDir, "work", it.work.id, "review", "ui");
  mkdirSync(ui, { recursive: true });
  const meta = (name: string, body: unknown) => {
    writeFileSync(join(ui, `${name}@360.png`), "png");
    writeFileSync(join(ui, `${name}.json`), JSON.stringify(body));
  };
  meta("a-one", {
    page: "a",
    state: "one",
    by: "fixture",
    url: "http://a/1",
    vitals: { cls: 0.02 },
  });
  meta("a-again", { page: "a", state: "again", by: "fixture", url: "http://a/1" });
  meta("a-two", { page: "a", state: "two", by: "fixture", url: "http://a/2" });
  meta("b-file", { page: "b", state: "file", by: "fixture", url: "file:///etc/passwd" });
  meta("b-js", { page: "b", state: "js", by: "fixture", url: "javascript:alert(1)" });
  meta("c-none", { page: "c", state: "none", by: "fixture" });
  writeFileSync(join(ui, "c-big@360.png"), "png");
  writeFileSync(
    join(ui, "c-big.json"),
    `{"page":"c","state":"big","url":"http://a/big","pad":"${"p".repeat(1024 * 1024)}"}`,
  );
  writeFileSync(join(ui, "c-link@360.png"), "png");
  const outside = tempDir();
  writeFileSync(join(outside, "meta.json"), JSON.stringify({ url: "http://a/linked" }));
  symlinkSync(join(outside, "meta.json"), join(ui, "c-link.json"));
  const metadata = captureMetadata(it.paths, it.work.id);
  expect(metadata).toHaveLength(6);
  const urls = captureUrls(metadata);
  expect(urls).toEqual(["http://a/1", "http://a/2", "file:///etc/passwd", "javascript:alert(1)"]);
  expect(capturesMeasuredCls(metadata)).toBe(true);
  expect(capturesMeasuredCls(metadata.filter((m) => m.state !== "one"))).toBe(false);
  const pages = auditPages("http://localhost:3000/", urls);
  expect(pages).toEqual([
    "http://localhost:3000/",
    "http://a/1",
    "http://a/2",
    "file:///etc/passwd",
    "javascript:alert(1)",
  ]);
  expect(
    auditPages("http://localhost:3000/", [
      "http://a/1",
      "http://a/2",
      "http://a/3",
      "http://a/4",
      "http://a/5",
    ]),
  ).toHaveLength(5);
  const env = fakeEnv(dir);
  const run = await audit({ ...it, env, pages });
  expect(run.pages.map((p) => [p.url, p.reason])).toEqual([
    ["http://localhost:3000/", null],
    ["http://a/1", null],
    ["http://a/2", null],
    ["file:///etc/passwd", "url not http(s)"],
    ["javascript:alert(1)", "url not http(s)"],
  ]);
  expect(calls(env).filter((c) => c.startsWith("new_page"))).toHaveLength(3);
  // A url carrying a shell sequence is quoted whole: `pwn` on the fake's PATH marks a file when a
  // shell runs it (shown first), the audit leaves no marker and the fake sees the url as one argument.
  const shell = item({ devtools: confirmed("chrome-devtools") });
  const marker = join(shell.root, "MARKER");
  const envShell = fakeEnv(dir, { FAKE_MARKER: marker });
  spawnSync("sh", ["-c", "echo $(pwn)"], { env: envShell });
  expect(existsSync(marker)).toBe(true);
  unlinkSync(marker);
  const quoted = await audit({ ...shell, env: envShell, pages: ["http://a/$(pwn)"] });
  expect(existsSync(marker)).toBe(false);
  expect(calls(envShell)[1]).toBe("new_page --url http://a/$(pwn) --output-format=json NOUSAGE=1");
  expect(quoted.pages[0]?.reason).toBeNull();
  // An id carrying a shell sequence is refused before any call with it.
  const badId = item({ devtools: confirmed("chrome-devtools") });
  const envBad = fakeEnv(dir, { FAKE_PAGE_ID: "bad" });
  const refused = await audit({ ...badId, env: envBad });
  expect(refused.pages[0]?.reason).toBe("new_page gave no page id");
  expect(existsSync(join(badId.root, "MARKER"))).toBe(false);
  expect(calls(envBad).some((c) => c.startsWith("lighthouse_audit"))).toBe(false);
  // A quote in a url, and the shell's characters on win32.
  const quote = item({ devtools: confirmed("chrome-devtools") });
  const envQuote = fakeEnv(dir);
  const withQuote = await audit({ ...quote, env: envQuote, pages: ["http://a/it's"] });
  expect(withQuote.pages[0]?.reason).toBe("url not shell-safe");
  const win = item({ devtools: confirmed("chrome-devtools") });
  const envWin = fakeEnv(dir);
  const windows = await audit({
    ...win,
    env: envWin,
    pages: ["http://a/?x=1&calc"],
    platform: "win32",
  });
  expect(windows.pages[0]?.reason).toBe("url not shell-safe");
  expect(calls(envWin).some((c) => c.startsWith("new_page"))).toBe(false);
  expect(existsSync(join(win.root, "MARKER"))).toBe(false);
  for (const url of ["http://a/?x=%41", "http://a/?a|b", "http://a/?a^b"]) {
    const row = item({ devtools: confirmed("chrome-devtools") });
    const e = fakeEnv(dir);
    expect(
      (await audit({ ...row, env: e, pages: [url], platform: "win32" })).pages[0]?.reason,
    ).toBe("url not shell-safe");
    expect(calls(e).some((c) => c.startsWith("new_page"))).toBe(false);
  }
  // A repository under a folder with a quote in its name: no quoting protects the paths, nothing
  // runs; on win32 the double quote (which no parsed url can carry: `new URL` percent-encodes it).
  for (const [prefix, platform] of [
    ["crew-it's-", "darwin"],
    ['crew-it"s-', "win32"],
  ] as const) {
    const quotedRoot = tempDir(prefix);
    mkdirSync(join(quotedRoot, ".crew"));
    const row = item({ devtools: confirmed("chrome-devtools") }, undefined, quotedRoot);
    const e = fakeEnv(dir);
    const refusedPath = await audit({ ...row, env: e, platform });
    expect(refusedPath.status).toBe("not captured");
    expect(refusedPath.reason).toBe("path not shell-safe");
    expect(calls(e)).toEqual([]);
  }
});

test("SP9-T7 AC-5: only an accessibility audit at 0 with items and a traced CLS over 0.1 the fixture did not measure are offences; scores, LCP and INP are advisory lines; the first page's offence comes first", async () => {
  const { dir } = fakeCli();
  const it = item({ devtools: confirmed("chrome-devtools") });
  const env = fakeEnv(dir);
  const graded = await audit({ ...it, env, fixtureMeasuredCls: false });
  expect(graded.offence).toBe(
    "audit: accessibility color-contrast scored 0 on http://localhost:3000/ (2 items)",
  );
  expect(graded.lines).toEqual([
    "audit: captured (1 page; review/ui/audit/audit.json)",
    "audit: accessibility color-contrast scored 0 on http://localhost:3000/ (2 items)",
    "audit: CLS 0.18 on http://localhost:3000/ (limit 0.1)",
    "audit: scores on http://localhost:3000/: performance 50, accessibility 80, best practices 100, seo 90",
    "audit: LCP 1234 ms, INP 200 ms on http://localhost:3000/",
  ]);
  // The fixture measured CLS: the trace's figure is advisory.
  const measured = await audit({
    ...item({ devtools: confirmed("chrome-devtools") }),
    env: fakeEnv(dir),
    fixtureMeasuredCls: true,
  });
  expect(measured.lines.some((l) => l.startsWith("audit: CLS"))).toBe(false);
  // The audit's variants: no items, null, 1 with items, another category at 0, CLS exactly 0.1.
  const variant = async (report: unknown, insights: unknown) => {
    const one = item({ devtools: confirmed("chrome-devtools") });
    const e = fakeEnv(dir);
    writeFileSync(e.FAKE_REPORT ?? "", JSON.stringify(report));
    writeFileSync(e.FAKE_INSIGHTS ?? "", JSON.stringify(insights));
    return audit({ ...one, env: e, fixtureMeasuredCls: false });
  };
  const withAudit = (audits: Record<string, unknown>) => ({
    ...REPORT,
    audits: { ...REPORT.audits, ...audits },
  });
  const noItems = await variant(
    withAudit({
      "color-contrast": { id: "color-contrast", title: "t", score: 0, details: { items: [] } },
    }),
    { cls: 0.1 },
  );
  expect(noItems.offence).toBeNull();
  const informative = await variant(
    withAudit({
      "color-contrast": { id: "color-contrast", title: "t", score: null, details: { items: [{}] } },
    }),
    { cls: 0.1 },
  );
  expect(informative.offence).toBeNull();
  const passing = await variant(
    withAudit({
      "color-contrast": { id: "color-contrast", title: "t", score: 1, details: { items: [{}] } },
    }),
    { cls: 0.1 },
  );
  expect(passing.offence).toBeNull();
  // uses-http2 is at 0 with items in REPORT and sits in performance and best-practices: never an accessibility offence.
  expect(passing.pages[0]?.lighthouse?.failed).toEqual([]);
  // Two pages, each with an offence: the first page's first.
  const two = item({ devtools: confirmed("chrome-devtools") });
  const e2 = fakeEnv(dir);
  const twice = await audit({ ...two, env: e2, pages: ["http://a/1", "http://a/2"] });
  expect(twice.offence).toBe(
    "audit: accessibility color-contrast scored 0 on http://a/1 (2 items)",
  );
});

test("SP9-T7 AC-7: the CLI's words reach the tail and the file as safe lines, an oversize reply gives no page id, a planted audit.json is overwritten, a planted or oversize report is ignored, and a symlinked audit.json is replaced without touching its target", async () => {
  const { dir } = fakeCli();
  const unsafe = item({ devtools: confirmed("chrome-devtools") });
  const env = fakeEnv(dir);
  const title = `\u001b[31m${"t".repeat(300)}`;
  writeFileSync(
    env.FAKE_REPORT ?? "",
    JSON.stringify({
      ...REPORT,
      audits: { ...REPORT.audits, "color-contrast": { ...REPORT.audits["color-contrast"], title } },
    }),
  );
  const result = await audit({ ...unsafe, env });
  const failed = result.pages[0]?.lighthouse?.failed[0];
  expect(failed?.title.length).toBe(120);
  expect(failed?.title.endsWith("…")).toBe(true);
  expect(failed?.title).not.toContain("\u001b");
  expect(result.lines.join("\n")).not.toContain("\u001b");
  const folder = join(unsafe.paths.crewDir, "work", unsafe.work.id, AUDIT_DIR);
  expect(readFileSync(join(folder, "audit.json"), "utf8")).not.toContain("\u001b");
  // An oversize new_page reply: no page id.
  const big = item({ devtools: confirmed("chrome-devtools") });
  const envBig = fakeEnv(dir, { FAKE_PAGE_ID: "big" });
  expect((await audit({ ...big, env: envBig })).pages[0]?.reason).toBe("new_page gave no page id");
  // A planted audit.json claiming captured, with nothing confirmed: overwritten.
  const planted = item();
  const plantedFolder = join(planted.paths.crewDir, "work", planted.work.id, AUDIT_DIR);
  mkdirSync(plantedFolder, { recursive: true });
  writeFileSync(join(plantedFolder, "audit.json"), JSON.stringify({ status: "captured" }));
  await audit({ ...planted, env: fakeEnv(dir) });
  expect(
    (JSON.parse(readFileSync(join(plantedFolder, "audit.json"), "utf8")) as { status: string })
      .status,
  ).toBe("not captured");
  // A report present before the command is not the command's: a planted `lighthouse-1.json` is
  // swept before the run (never beside this run's record under the engine's name), a planted
  // `planted.json` is left and never read; no Lighthouse report.
  const stale = item({ devtools: confirmed("chrome-devtools") });
  const staleFolder = join(stale.paths.crewDir, "work", stale.work.id, AUDIT_DIR);
  mkdirSync(staleFolder, { recursive: true });
  for (const name of ["lighthouse-1.json", "planted.json"]) {
    writeFileSync(join(staleFolder, name), JSON.stringify(REPORT));
    utimesSync(join(staleFolder, name), new Date(0), new Date(0));
  }
  const envNone = fakeEnv(dir, { FAKE_LIGHTHOUSE: "none" });
  const ignored = await audit({ ...stale, env: envNone });
  expect(ignored.pages[0]?.reason).toBe("no Lighthouse report");
  expect(ignored.pages[0]?.lighthouse).toBeNull();
  expect(readdirSync(staleFolder).sort()).toEqual([
    "audit.json",
    "insights-1.txt",
    "planted.json",
    "trace-1.json",
  ]);
  // A report over the cap: no Lighthouse report.
  const oversize = item({ devtools: confirmed("chrome-devtools") });
  const envOver = fakeEnv(dir, { FAKE_LIGHTHOUSE: "big" });
  expect((await audit({ ...oversize, env: envOver })).pages[0]?.reason).toBe(
    "no Lighthouse report",
  );
  // A symlinked audit.json: replaced by a regular file, the target untouched.
  const linked = item();
  const linkedFolder = join(linked.paths.crewDir, "work", linked.work.id, AUDIT_DIR);
  mkdirSync(linkedFolder, { recursive: true });
  const outside = tempDir();
  writeFileSync(join(outside, "target.json"), "untouched");
  symlinkSync(join(outside, "target.json"), join(linkedFolder, "audit.json"));
  await audit({ ...linked, env: fakeEnv(dir) });
  expect(readFileSync(join(outside, "target.json"), "utf8")).toBe("untouched");
  expect(JSON.parse(readFileSync(join(linkedFolder, "audit.json"), "utf8"))).toMatchObject({
    status: "not captured",
  });
});

test("SP9-T7 AC-1 (detection and the profile): the block is proposed only when given an environment with the CLI and an existing Chrome, kept when confirmed, replaced when proposed, and dropped by loadProfile when malformed", () => {
  const { dir } = fakeCli();
  const chrome = join(dir, "chrome");
  writeFileSync(chrome, "#!/bin/sh\nexit 0\n");
  chmodSync(chrome, 0o755);
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "x" } }) });
  const base = { ...testEnv(), PATH: `${dir}:/usr/bin:/bin` };
  const withChrome = detectProfile(root, null, [], { ...base, WIZARDINGCODE_CREW_BROWSER: chrome });
  expect(withChrome.browser).toEqual({
    devtools: { command: "chrome-devtools", source: "proposed" },
  });
  expect(
    detectProfile(root, null, [], { ...base, WIZARDINGCODE_CREW_BROWSER: join(dir, "missing") })
      .browser,
  ).toBeUndefined();
  expect(
    detectProfile(root, null, [], {
      ...testEnv(),
      PATH: "/usr/bin:/bin",
      WIZARDINGCODE_CREW_BROWSER: chrome,
    }).browser,
  ).toBeUndefined();
  expect(detectProfile(root).browser).toBeUndefined();
  // The CLI there and no Chrome at all: the search list injected, so the machine's own Chrome never decides the row.
  expect(detectBrowser(base, [])).toBeNull();
  expect(detectBrowser(base, [chrome])).toEqual({
    devtools: { command: "chrome-devtools", source: "proposed" },
  });
  expect(detectBrowser({ ...base, PATH: "/usr/bin:/bin" }, [chrome])).toBeNull();
  // Merging: a confirmed block outlives a detection that found none; a proposed one follows it.
  const previous: Profile = {
    ...withChrome,
    browser: { devtools: confirmed("npx chrome-devtools-mcp") },
  };
  expect(mergeProfile(previous, withChrome.targets, null, null).browser).toEqual({
    devtools: confirmed("npx chrome-devtools-mcp"),
  });
  const proposedBefore: Profile = { ...withChrome };
  expect(mergeProfile(proposedBefore, withChrome.targets, null, null).browser).toBeUndefined();
  expect(
    mergeProfile(proposedBefore, withChrome.targets, null, {
      devtools: { command: "chrome-devtools", source: "proposed" },
    }).browser,
  ).toEqual({ devtools: { command: "chrome-devtools", source: "proposed" } });
  // The loader drops a malformed block and keeps the rest.
  const paths = repoPaths(root, testEnv());
  saveProfile(paths, {
    ...withChrome,
    browser: { devtools: { command: 3 } },
  } as unknown as Profile);
  const loaded = loadProfile(paths).profile;
  expect(loaded?.browser).toBeUndefined();
  expect(loaded?.targets).toEqual(withChrome.targets);
});
