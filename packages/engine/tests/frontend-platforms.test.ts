import { expect, test } from "bun:test";
import { LABELS } from "../src/design-proof.ts";
import {
  ADDRESS,
  HEADER,
  listed,
  repoFile,
  rows,
  sections,
  tableHeaders,
  tellsToFetchOrRun,
} from "./frontend-skill-rows.ts";

// The frontend team's last two skills (item 2026-11-26-004): the group Platforms, its subjects
// Mobile and Desktop, and the playbook of the kind `mobile-app`. The playbook's standing checks
// are `frontend-playbooks.test.ts`'s; this file holds Platforms and the playbook's own clauses.
const PLATFORMS = "plugins/core/skills/wizardingcode-frontend-platforms";
const MOBILE_APP = "plugins/core/skills/wizardingcode-frontend-mobile-app";
const STRATEGY = "plugins/core/skills/wizardingcode-frontend-strategy/SKILL.md";
const SUBJECTS = ["Mobile", "Desktop"];
const SECTIONS = [
  "When",
  "How to read a row",
  "Mobile",
  "Desktop",
  "Where the sources disagree",
  "What the team never claims",
  "Done when",
  "Provenance",
];
const REVENUECAT = "https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026";
/** The pages the research's notes mark as read at the page itself that Platforms cites. */
const OPENED: string[] = [
  "https://developer.apple.com/design/human-interface-guidelines/layout",
  "https://developer.apple.com/design/human-interface-guidelines/accessibility",
  "https://developer.apple.com/design/human-interface-guidelines/typography",
  "https://developer.apple.com/design/human-interface-guidelines/materials",
  "https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility",
  "https://developer.apple.com/design/human-interface-guidelines/tab-bars",
  "https://developer.apple.com/design/human-interface-guidelines/sheets",
  "https://developer.apple.com/design/human-interface-guidelines/playing-haptics",
  "https://developer.apple.com/design/human-interface-guidelines/launching",
  "https://developer.apple.com/design/human-interface-guidelines/privacy",
  "https://developer.apple.com/app-store/review/guidelines/",
  "https://developer.apple.com/app-store/subscriptions/",
  "https://support.google.com/googleplay/android-developer/answer/9900533?hl=en",
  "https://developer.apple.com/design/human-interface-guidelines/onboarding",
  "https://developer.apple.com/design/human-interface-guidelines/ratings-and-reviews",
  "https://www.nngroup.com/articles/mobile-app-onboarding/",
  "https://www.nngroup.com/articles/permission-requests/",
  "https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes",
  "https://developer.android.com/about/versions/16/behavior-changes-16",
  "https://developer.android.com/about/versions/17/behavior-changes-17",
  "https://developer.android.com/docs/quality-guidelines/core-app-quality",
  "https://developer.android.com/about/versions/14/features#non-linear-font-scaling",
  "https://developer.android.com/develop/ui/views/haptics/haptics-principles",
  "https://support.google.com/googleplay/android-developer/answer/9888077?hl=en",
  "https://developer.android.com/jetpack/androidx/releases/compose-material3",
  "https://reactnative.dev/docs/platform-specific-code",
  "https://docs.expo.dev/versions/latest/sdk/ui/",
  "https://docs.expo.dev/versions/latest/sdk/glass-effect/",
  "https://docs.flutter.dev/ui/adaptive-responsive/best-practices",
  "https://docs.flutter.dev/ui/adaptive-responsive/platform-adaptations",
  "https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php",
  "https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php",
  "https://www.nngroup.com/articles/touch-target-size/",
  "https://developer.apple.com/design/human-interface-guidelines/designing-for-macos",
  "https://developer.apple.com/design/human-interface-guidelines/the-menu-bar",
  "https://developer.apple.com/design/human-interface-guidelines/keyboards",
  "https://developer.apple.com/design/human-interface-guidelines/windows",
  "https://developer.apple.com/design/human-interface-guidelines/gestures",
  "https://learn.microsoft.com/en-us/windows/apps/design/style/mica",
  "https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic",
  "https://learn.microsoft.com/en-us/windows/apps/design/style/typography",
  "https://learn.microsoft.com/en-us/windows/apps/design/style/spacing",
  "https://learn.microsoft.com/en-us/windows/apps/design/style/rounded-corner",
  "https://learn.microsoft.com/en-us/windows/apps/design/basics/titlebar-design",
  "https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-snap-layout-menu",
  "https://learn.microsoft.com/en-us/windows/apps/design/layout/screen-sizes-and-breakpoints-for-responsive-design",
  "https://learn.microsoft.com/en-us/windows/apps/design/input/guidelines-for-targeting",
  "https://learn.microsoft.com/en-us/windows/apps/design/controls/navigationview",
  "https://learn.microsoft.com/en-us/windows/apps/publish/store-policies",
  "https://www.electronjs.org/docs/latest/tutorial/custom-title-bar",
  "https://www.electronjs.org/docs/latest/tutorial/dark-mode",
  "https://v2.tauri.app/learn/window-customization/",
  "https://v2.tauri.app/learn/window-menu/",
  "https://learn.microsoft.com/en-us/dotnet/maui/platform-integration/customize-ui-appearance",
];
/** The hosts of a platform owner or of a framework's documentation: their rows are platform guidance. */
const PLATFORM_HOSTS = [
  "developer.apple.com",
  "developer.android.com",
  "support.google.com",
  "learn.microsoft.com",
  "reactnative.dev",
  "docs.expo.dev",
  "docs.flutter.dev",
  "www.electronjs.org",
  "v2.tauri.app",
];
/** The commands of the subject the four files never carry, in the standing check's form. */
const SUBJECT_COMMANDS =
  /(?:^|[\s`;&|(])(?:xcrun|xcodebuild|eas|expo|flutter|fastlane|gradle|gradlew|\.\/gradlew|adb|codesign|notarytool|winapp|tauri|electron-forge)\s|\bmcpbridge\b|claude mcp|MobileBuildMCP|mobilebuildmcp/m;
const STANDING_COMMANDS =
  /(?:^|[\s`;&|(])(?:npx|npm|pnpm|yarn|bunx|curl|wget|brew|pip|composer)\s|git clone|\binstall\b/m;
const VERBS = /\b(?:open|visit|fetch|download|install|clone|run)\b/i;
const NOT_PROVEN = "not yet proven on a real project";
const KEYS =
  "signing keys and store credentials never reach the model, and a build, a store submission or an update is a person's decision";
const HOLDER = "an item that ends in a distributed build names who holds them";

const file = (dir: string, name = "SKILL.md") => repoFile(`${dir}/${name}`);
const section = (dir: string, title: string) => sections(file(dir)).get(title) ?? [];
const platformRows = () => SUBJECTS.flatMap((title) => rows(section(PLATFORMS, title)));
const host = (address: string) => address.replace(/^https?:\/\//, "").split("/")[0] ?? "";
const folded = (text: string) => text.replace(/\s+/g, " ").toLowerCase();

test("platforms AC-19: the Platforms skill has its frontmatter, its title, its eight sections in order and at least four rules of four columns under Mobile and under Desktop", () => {
  const text = file(PLATFORMS);
  expect(text).toMatch(
    /^---\nname: wizardingcode-frontend-platforms\ndescription: "[^"\n]+"\n---\n/,
  );
  const description = /description: "([^"]+)"/.exec(text)?.[1] ?? "";
  expect(description.split(". ").length).toBe(1);
  expect(text.split("\n").find((l) => l.startsWith("# "))).toBe("# Platforms");
  expect([...sections(text).keys()]).toEqual(SECTIONS);
  for (const title of SUBJECTS) {
    const own = rows(section(PLATFORMS, title));
    expect(own.length, title).toBeGreaterThanOrEqual(4);
    for (const row of own) expect(row, title).toHaveLength(4);
    for (const header of tableHeaders(section(PLATFORMS, title)))
      expect(header, title).toBe(HEADER);
  }
});

test("platforms AC-20: every rule of Platforms has a label its source carries, a platform's page as platform guidance, a vendor's page as a hypothesis that says so, and no norm and nothing measured here", () => {
  const all = platformRows();
  expect(all.length).toBeGreaterThanOrEqual(8);
  for (const [rule, label, source, note] of all) {
    const at = rule ?? "";
    const name = (label ?? "").replace(/`/g, "");
    expect(LABELS as readonly string[], at).toContain(name);
    expect(name, at).not.toBe("measured-here");
    expect(name, at).not.toBe("norm");
    expect(source ?? "", at).toMatch(/^https:\/\/\S+$/);
    expect((note ?? "").length, at).toBeGreaterThan(10);
    const from = host(source ?? "");
    if (name === "platform-guidance") expect(PLATFORM_HOSTS, at).toContain(from);
    if (from === "www.revenuecat.com") {
      expect(name, at).toBe("hypothesis");
      expect(`${rule} ${note}`, at).toContain("a vendor's");
    }
    if (name === "published-study")
      expect(note ?? "", at).toMatch(/replication unknown|repeated by/);
  }
  // The stores' rules are rows of Mobile.
  const mobile = rows(section(PLATFORMS, "Mobile")).map(([, , source]) => source ?? "");
  expect(mobile).toContain("https://developer.apple.com/app-store/review/guidelines/");
  expect(mobile).toContain("https://developer.apple.com/app-store/subscriptions/");
  expect(mobile.some((s) => s.startsWith("https://support.google.com/googleplay/"))).toBe(true);
});

test("platforms AC-21: every address Platforms cites is in the closed list of the pages read, and its sources file and the skill hold each other with the date each page was read", () => {
  const lines = listed(`${PLATFORMS}/sources.md`);
  const cited = new Set(file(PLATFORMS).match(ADDRESS) ?? []);
  expect(cited.size).toBeGreaterThan(8);
  for (const address of cited) {
    expect(OPENED, address).toContain(address);
    const line = lines.get(address);
    expect(line, `sources.md lacks ${address}`).toBeDefined();
    expect(line, address).toContain("read on 2026-11-16");
    expect((line ?? "").split(" · ").length, address).toBeGreaterThanOrEqual(4);
  }
  for (const address of lines.keys()) expect(cited.has(address), address).toBe(true);
});

test("platforms AC-22: the sizes of a target disagree with a default, a distributed build names who holds the signing credentials, each phase is not proven on a real project, and neither skill gives keys or a submission to the model", () => {
  const disagree = section(PLATFORMS, "Where the sources disagree").join("\n");
  for (const size of ["44 pt", "48 dp", "40 px"]) expect(disagree, size).toContain(size);
  expect(disagree).toContain("Default:");
  expect(folded(file(PLATFORMS))).toContain(HOLDER);
  for (const dir of [PLATFORMS, MOBILE_APP]) {
    expect(folded(section(dir, "When").join(" ")), dir).toContain(NOT_PROVEN);
    expect(folded(file(dir)), dir).toContain(KEYS);
  }
});

test("platforms AC-24: the playbook's title, its rows each a vendor's observational hypothesis from one article, its figures never a target, and the search summary given no figure", () => {
  const text = file(MOBILE_APP);
  expect(text.split("\n").find((l) => l.startsWith("# "))).toBe("# Mobile app playbook");
  const own = [...sections(text).values()].flatMap((lines) => rows(lines));
  expect(own.length).toBeGreaterThanOrEqual(5);
  for (const [rule, label, source, note] of own) {
    const line = `${rule} ${note}`;
    expect(label, rule).toBe("`hypothesis`");
    expect(source, rule).toBe(REVENUECAT);
    expect(line, rule).toContain("a vendor's");
    expect(line, rule).toContain("observational");
  }
  expect(folded(text)).toContain("a typical range and never a target");
  const absent = section(MOBILE_APP, "What the research did not find").join("\n");
  const summary = absent
    .split("\n")
    .filter((l) => /search summary/.test(l) && /download-to-paid/.test(l));
  expect(summary).toHaveLength(1);
  expect(summary[0] ?? "").toContain("no figure of it is given");
  expect((summary[0] ?? "").match(/\d+(?:\.\d+)?%/)).toBeNull();
  expect(text).not.toContain("pricepush");
});

test("platforms AC-25: what stays true on a paywall is one paragraph with no address that holds each clause", () => {
  const stays = section(MOBILE_APP, "What stays true").filter((l) => l.trim().length > 0);
  expect(stays).toHaveLength(1);
  const paragraph = stays[0] ?? "";
  expect(paragraph.match(ADDRESS)).toBeNull();
  for (const part of [
    "the amount billed is the most prominent pricing element",
    "declining the paywall is as easy as accepting it",
    "cancelling is as reachable as subscribing",
    "a trial says when it charges and how much",
    "no plan, trial or add-on that adds to what the person pays is selected for them",
    "a change to how a subscription is charged is a payments change the security review reads",
    "a request for the opposite of any of these is a blocking objection, as `wizardingcode-frontend-strategy` says, and never a choice with a label",
  ])
    expect(paragraph, part).toContain(part);
});

test("platforms AC-26: the Strategy skill names the tenth playbook and sends a change to an app to Platforms in a step of its own, right after Verification's", () => {
  const steps = repoFile(STRATEGY)
    .split(/\r?\n/)
    .filter((l) => /^\d+\. /.test(l));
  const playbook = steps.filter((l) => l.includes("**Read the kind's playbook**"));
  expect(playbook).toHaveLength(1);
  expect(playbook[0] ?? "").toContain("`wizardingcode-frontend-mobile-app` for `mobile-app`");
  expect(playbook[0] ?? "").toContain("A kind with no playbook yet has only this skill");
  const own = steps.filter((l) => l.includes("`wizardingcode-frontend-platforms`"));
  expect(own).toHaveLength(1);
  const step = own[0] ?? "";
  expect(step).toContain(
    "before the first screen of a change to an app on a phone or in a desktop window",
  );
  expect(step.match(ADDRESS)).toBeNull();
  for (const other of ["visual-craft", "screens", "engineering", "verification", "strategy"])
    expect(step, other).not.toContain(`wizardingcode-frontend-${other}`);
  const verification = steps.findIndex((l) => l.includes("`wizardingcode-frontend-verification`"));
  expect(verification).toBeGreaterThanOrEqual(0);
  expect(steps.indexOf(step)).toBe(verification + 1);
});

test("platforms AC-27: the four files carry no command of the subject, no standing command or verb on an address, and no third party's skill set", () => {
  const SETS = [
    "impeccable",
    "taste-skill",
    "ui-ux-pro-max",
    "anthropics/skills",
    "superdesign",
    "agent-skills",
  ];
  for (const dir of [PLATFORMS, MOBILE_APP])
    for (const name of ["SKILL.md", "sources.md"]) {
      const text = file(dir, name);
      const at = `${dir}/${name}`;
      expect(tellsToFetchOrRun(text, SUBJECT_COMMANDS, VERBS), at).toEqual([]);
      expect(tellsToFetchOrRun(text, STANDING_COMMANDS, VERBS), at).toEqual([]);
      for (const set of SETS) expect(text.toLowerCase(), `${at}: ${set}`).not.toContain(set);
    }
});

test("platforms AC-27: the subject's command check, on texts of the test's own", () => {
  const faults = (text: string) => tellsToFetchOrRun(text, SUBJECT_COMMANDS, VERBS);
  for (const text of [
    "Run `xcrun mcpbridge` first.",
    "A build with eas build.",
    "Then flutter build ios.",
    "Sign with codesign --deep.",
    "Add it with claude mcp add.",
    "MobileBuildMCP drives the simulator.",
    "Run ./gradlew assembleRelease.",
  ])
    expect(faults(text).length, text).toBeGreaterThan(0);
  for (const text of [
    "Flutter's guidance on adaptive design.",
    "Expo and Tauri are frameworks.",
    "The page https://docs.flutter.dev/ui/adaptive-responsive/best-practices is provenance.",
  ])
    expect(faults(text), text).toEqual([]);
});
