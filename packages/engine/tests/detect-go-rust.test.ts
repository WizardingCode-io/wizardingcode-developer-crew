import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { goDetector } from "../src/detect/go.ts";
import { DETECTORS, detectProfile } from "../src/detect/index.ts";
import { rustDetector } from "../src/detect/rust.ts";
import type { DetectedTarget } from "../src/detect/types.ts";
import { depsAuditCommand, plannedGates, runGates } from "../src/gates.ts";
import { registerPack } from "../src/packs.ts";
import { isTestPath } from "../src/paths-kind.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { ensureProfile, loadProfile } from "../src/profile.ts";
import { CORE_STACKS, type Target } from "../src/types.ts";
import { createWork } from "../src/work.ts";
import { childEnv, cliIo, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";
import { manifest, userDir, writePack } from "./pack-fixtures.ts";

const ITEM = "2026-11-21-002";
const GO_MOD = "module example.com/m\n\ngo 1.21\n";
const CRATE = (name: string) =>
  `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n`;
const CLIPPY = "cargo clippy --all-targets -- -D warnings";

const RUST: DetectedTarget = {
  stack: "rust",
  packageManager: "cargo",
  gates: {
    build: "cargo build",
    test: "cargo test",
    typecheck: "cargo check --all-targets",
    lint: CLIPPY,
  },
  proposedGates: ["lint"],
};
const RUST_ROOT: DetectedTarget = {
  ...RUST,
  gates: {
    build: "cargo build --workspace",
    test: "cargo test --workspace",
    typecheck: "cargo check --workspace --all-targets",
    lint: "cargo clippy --workspace --all-targets -- -D warnings",
  },
};

/** A folder with one manifest of the text given. */
function withManifest(name: string, text: string): string {
  const dir = tempDir("crew-detect-");
  write(dir, name, text);
  return dir;
}

test(`${ITEM} AC-8: a folder with a go.mod is a Go target with the toolchain's gates, golangci-lint where the folder configures it, and null where go.mod is absent, a folder or a link`, () => {
  const GO = {
    stack: "go",
    packageManager: "go",
    gates: { build: "go build ./...", test: "go test ./...", lint: "go vet ./..." },
  };
  expect(goDetector.stack).toBe("go");
  expect(goDetector.detect(withManifest("go.mod", GO_MOD))).toEqual(GO);
  // The file's text is not read: an empty one and one that is no module file answer the same.
  expect(goDetector.detect(withManifest("go.mod", ""))).toEqual(GO);
  expect(goDetector.detect(withManifest("go.mod", "[workspace]\nmembers = [\n"))).toEqual(GO);
  for (const config of [".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"]) {
    const dir = withManifest("go.mod", GO_MOD);
    write(dir, config, "");
    expect({ config, target: goDetector.detect(dir) }).toEqual({
      config,
      target: { ...GO, gates: { ...GO.gates, lint: "golangci-lint run" } },
    });
  }
  // A name near a configuration's is none.
  const near = withManifest("go.mod", GO_MOD);
  write(near, "golangci.yml", "");
  write(near, ".golangci.yml.bak", "");
  expect(goDetector.detect(near)).toEqual(GO);
  expect(goDetector.detect(tempDir("crew-detect-"))).toBeNull();
  expect(goDetector.detect(withManifest("go.sum", ""))).toBeNull();
  const folder = tempDir("crew-detect-");
  mkdirSync(join(folder, "go.mod"));
  expect(goDetector.detect(folder)).toBeNull();
  const linked = withManifest("elsewhere.mod", GO_MOD);
  symlinkSync(join(linked, "elsewhere.mod"), join(linked, "go.mod"));
  expect(goDetector.detect(linked)).toBeNull();
});

test(`${ITEM} AC-18: a folder with a Cargo.toml that is no workspace root is a Rust target with four gates, the lint named as proposed whatever the PATH holds, and null where the manifest is absent, a folder or a link`, () => {
  expect(rustDetector.stack).toBe("rust");
  const dir = withManifest("Cargo.toml", CRATE("app"));
  expect(rustDetector.detect(dir)).toEqual(RUST);
  // The answer does not depend on the machine: with cargo-clippy on the PATH and with an empty PATH.
  const bin = tempDir("crew-bin-");
  write(bin, "cargo-clippy", "#!/bin/sh\nexit 0\n");
  chmodSync(join(bin, "cargo-clippy"), 0o755);
  const saved = process.env.PATH;
  try {
    process.env.PATH = bin;
    expect(rustDetector.detect(dir)).toEqual(RUST);
    process.env.PATH = "";
    expect(rustDetector.detect(dir)).toEqual(RUST);
  } finally {
    process.env.PATH = saved;
  }
  expect(rustDetector.detect.length).toBe(1);
  expect(rustDetector.detect(withManifest("Cargo.toml", ""))).toEqual(RUST);
  expect(rustDetector.detect(tempDir("crew-detect-"))).toBeNull();
  expect(rustDetector.detect(withManifest("Cargo.lock", ""))).toBeNull();
  const folder = tempDir("crew-detect-");
  mkdirSync(join(folder, "Cargo.toml"));
  expect(rustDetector.detect(folder)).toBeNull();
  const linked = withManifest("elsewhere.toml", `${CRATE("app")}\n[workspace]\n`);
  symlinkSync(join(linked, "elsewhere.toml"), join(linked, "Cargo.toml"));
  expect(rustDetector.detect(linked)).toBeNull();
});

test(`${ITEM} AC-10: a workspace root takes --workspace on its four commands; a [workspace] table or any table under it makes a root, and a word elsewhere in the manifest does not`, () => {
  const pkg = CRATE("app");
  const roots: [string, string][] = [
    ["the table", `${pkg}\n[workspace]\nmembers = ["crates/*"]\n`],
    ["the table alone, no package", '[workspace]\nmembers = ["a", "b"]\nresolver = "2"\n'],
    ["[workspace.dependencies] alone", `${pkg}\n[workspace.dependencies]\nserde = "1"\n`],
    ["[workspace.package] alone", `${pkg}\n[workspace.package]\nedition = "2021"\n`],
    ["spaces inside the bracket", `${pkg}\n[ workspace ]\n`],
    ["spaces before a dotted name", `${pkg}\n[ workspace . lints ]\n`],
    ["an indented header", `${pkg}\n  \t[workspace]\n`],
    ["a header followed by a comment", `${pkg}\n[workspace] # the root\n`],
    ["the dotted form before any header", `workspace.members = ["a"]\n\n${pkg}`],
    ["the inline form before any header", `workspace = { members = ["a"] }\n\n${pkg}`],
    ["the inline form with no space", `workspace={members=["a"]}\n\n${pkg}`],
    ["a header on the last line, no newline", `${pkg}\n[workspace]`],
    ["carriage returns", `${pkg}\r\n[workspace]\r\nmembers = []\r\n`],
  ];
  for (const [what, text] of roots)
    expect({ what, target: rustDetector.detect(withManifest("Cargo.toml", text)) }).toEqual({
      what,
      target: RUST_ROOT,
    });
  const thousand = Array.from({ length: 1000 }, (_, i) => `  "crates/m${i}/*a*a*a*b",`).join("\n");
  const notRoots: [string, string][] = [
    ["a dependency inheriting", `${pkg}\n[dependencies]\nserde = { workspace = true }\n`],
    ["a dependency's dotted key", `${pkg}\n[dependencies]\nserde.workspace = true\n`],
    ["metadata named workspace", `${pkg}\n[package.metadata.workspace]\nx = 1\n`],
    ["another table's name", `${pkg}\n[workspaces]\nx = 1\n`],
    ["a longer first name", `${pkg}\n[workspace-hack]\nx = 1\n`],
    ["a commented header", `${pkg}\n# [workspace]\n#[workspace]\n`],
    ["a table under dependencies", `${pkg}\n[dependencies.workspace]\nversion = "1"\n`],
    ["an array of tables", `${pkg}\n[[workspace]]\nx = 1\n`],
    ["the key after a table header", `${pkg}\nworkspace = 1\nworkspace.members = ["a"]\n`],
    ["a members list under the package", `${pkg}\nmembers = [\n${thousand}\n]\n`],
    [
      "a value that holds the header",
      `${pkg}\ndescription = "[workspace]"\nx = "a [workspace] b"\n`,
    ],
  ];
  for (const [what, text] of notRoots)
    expect({ what, target: rustDetector.detect(withManifest("Cargo.toml", text)) }).toEqual({
      what,
      target: RUST,
    });
  // Over 1 MiB the text is not read: a target without the flag. At the cap it is read.
  const header = "[workspace]\n";
  const filler = (bytes: number) => `# ${"x".repeat(bytes - 3)}\n`;
  const atCap = `${filler(1024 * 1024 - header.length)}${header}`;
  expect(Buffer.byteLength(atCap)).toBe(1024 * 1024);
  expect(rustDetector.detect(withManifest("Cargo.toml", atCap))).toEqual(RUST_ROOT);
  expect(
    rustDetector.detect(withManifest("Cargo.toml", `${filler(1024 * 1024)}${header}`)),
  ).toEqual(RUST);
});

test(`${ITEM} AC-19: the profile holds each Go module and each crate as a target of its own, none marked a workspace's member, the Rust lint proposed and kept once confirmed`, () => {
  expect(DETECTORS.map((d) => d.stack)).toEqual(["node", "php", "python", "go", "rust"]);
  const go = tempDir("crew-go-");
  write(go, "go.mod", GO_MOD);
  write(go, "go.work", "go 1.21\n\nuse (\n\t.\n\t./tools/gen\n)\n");
  write(go, "tools/gen/go.mod", "module example.com/m/tools/gen\n\ngo 1.21\n");
  write(go, "vendor/example.com/dep/go.mod", GO_MOD);
  const goTargets = detectProfile(go).targets;
  expect(goTargets.map((t) => `${t.path}:${t.stack}:${t.packageManager}`)).toEqual([
    ".:go:go",
    "tools/gen:go:go",
  ]);
  for (const target of goTargets) {
    expect(target.gates).toEqual({
      build: { command: "go build ./...", source: "detected" },
      test: { command: "go test ./...", source: "detected" },
      lint: { command: "go vet ./...", source: "detected" },
    });
    expect(target.workspaceOf).toBeUndefined();
    expect(target.testScoped).toBeUndefined();
  }
  const rust = tempDir("crew-rust-");
  write(rust, "Cargo.toml", `${CRATE("app")}\n[workspace]\nmembers = ["crates/*"]\n`);
  write(rust, "crates/core/Cargo.toml", CRATE("core"));
  write(rust, "crates/cli/Cargo.toml", CRATE("cli"));
  write(rust, "target/package/app-0.1.0/Cargo.toml", CRATE("app"));
  const first = detectProfile(rust);
  expect(first.targets.map((t) => `${t.path}:${t.stack}:${t.packageManager}`)).toEqual([
    ".:rust:cargo",
    "crates/cli:rust:cargo",
    "crates/core:rust:cargo",
  ]);
  const sources = (gates: DetectedTarget["gates"]): Target["gates"] => ({
    build: { command: gates.build ?? "", source: "detected" },
    test: { command: gates.test ?? "", source: "detected" },
    typecheck: { command: gates.typecheck ?? "", source: "detected" },
    lint: { command: gates.lint ?? "", source: "proposed" },
  });
  expect(first.targets[0]?.gates).toEqual(sources(RUST_ROOT.gates));
  expect(first.targets[1]?.gates).toEqual(sources(RUST.gates));
  expect(first.targets[2]?.gates).toEqual(sources(RUST.gates));
  for (const target of first.targets) {
    expect(target.workspaceOf).toBeUndefined();
    expect(target.testScoped).toBeUndefined();
  }
  // A person's confirmation outlives a fresh detection; the unconfirmed crates stay proposed.
  const root = first.targets[0];
  if (!root?.gates.lint) throw new Error("no lint");
  root.gates.lint = { ...root.gates.lint, source: "confirmed" };
  const again = detectProfile(rust, first);
  expect(again.targets[0]?.gates.lint).toEqual({
    command: "cargo clippy --workspace --all-targets -- -D warnings",
    source: "confirmed",
  });
  expect(again.targets[1]?.gates.lint).toEqual({ command: CLIPPY, source: "proposed" });
});

test(`${ITEM} AC-20: crew detect prints a Go target and a Rust target with the lint as proposed, and --stack takes go and rust and refuses another with a usage naming both`, async () => {
  expect(CORE_STACKS).toEqual(["node", "php", "python", "go", "rust", "other"]);
  const go = makeRepo({ "go.mod": GO_MOD, "main.go": "package main\n" });
  const inGo = cliIo(go, testEnv());
  const detected = await inGo("detect");
  expect(detected.code).toBe(0);
  expect(detected.out).toContain(
    "  . (go, go): build=go build ./..., test=go test ./..., lint=go vet ./...\n",
  );
  expect(
    (await inGo("profile", "set", "lint", "golangci-lint run ./...", "--stack", "go")).code,
  ).toBe(0);
  const rust = makeRepo({ "Cargo.toml": CRATE("app"), "src/lib.rs": "pub fn a() {}\n" });
  const env = testEnv();
  const inRust = cliIo(rust, env);
  const rustDetected = await inRust("detect");
  expect(rustDetected.code).toBe(0);
  expect(rustDetected.out).toContain(
    `  . (rust, cargo): build=cargo build, test=cargo test, typecheck=cargo check --all-targets, lint=${CLIPPY} [proposed]\n`,
  );
  expect(
    (await inRust("profile", "set", "lint", "golangci-lint run ./...", "--stack", "rust")).code,
  ).toBe(0);
  expect(loadProfile(repoPaths(rust, env)).profile?.targets[0]?.gates.lint).toEqual({
    command: "golangci-lint run ./...",
    source: "confirmed",
  });
  const refused = await inRust("profile", "set", "lint", "x", "--stack", "cobol");
  expect(refused.code).toBe(1);
  expect(`${refused.out}${refused.err}`.trim()).toBe(
    'usage: crew profile set <gate> "<cmd>" --stack <node|php|python|go|rust|other>',
  );
});

test(`${ITEM} AC-13: a pack's detector rule named go or rust is refused as naming a core stack, and one that extends go is taken`, () => {
  const rule = manifest().detectors[0];
  if (!rule) throw new Error("no rule");
  const { extends: _core, ...plain } = rule;
  for (const stack of ["go", "rust"]) {
    const refused = registerPack(
      userDir(),
      writePack({ detectors: [{ ...plain, stack }] }),
      "command",
    );
    expect({ stack, answer: refused }).toEqual({
      stack,
      answer: { refused: `detector ${stack}: a core stack is not a pack's` },
    });
  }
  for (const core of ["go", "rust"] as const) {
    const added = registerPack(
      userDir(),
      writePack({
        detectors: [{ ...plain, stack: "gin", extends: core, markers: ["go.mod"], gates: {} }],
      }),
      "command",
    );
    expect("refused" in added ? added.refused : "registered").toBe("registered");
  }
});

test(`${ITEM} AC-14: a crate's tests, test or spec folder under crates/<name>/ is a test path, and nothing wider`, () => {
  for (const path of [
    "crates/core/tests/api.rs",
    "crates/core/test/api.rs",
    "crates/core/spec/api.rs",
    "crates/core/tests/common/mod.rs",
  ])
    expect(isTestPath(path), path).toBe(true);
  for (const path of [
    "crates/core/src/lib.rs",
    "crates/core/testsuite/api.rs",
    "mycrates/core/tests/api.rs",
    "crates/core/nested/tests/api.rs",
    "crates/tests.rs",
    "x/crates/core/tests/api.rs",
  ])
    expect(isTestPath(path), path).toBe(false);
});

/** A folder of stand-in toolchains: `cargo` and `go`, whose lint prints what `CREW_TEST_LINT` holds and fails. */
function standIns(): string {
  const bin = tempDir("crew-bin-");
  const script = (verb: string, code: number) =>
    [
      "#!/bin/sh",
      `if [ "$1" = "${verb}" ] && [ -n "$CREW_TEST_LINT" ]; then`,
      '  printf "%b" "$CREW_TEST_LINT"',
      `  exit ${code}`,
      "fi",
      "exit 0",
      "",
    ].join("\n");
  write(bin, "cargo", script("clippy", 101));
  write(bin, "go", script("vet", 1));
  for (const name of ["cargo", "go"]) chmodSync(join(bin, name), 0o755);
  return bin;
}

test(`${ITEM} AC-15: a failing lint in clippy's form and in go vet's form passes as pre-existing where it names only files the item left, fails named where it names one the item changed, and a member's lint in a workspace below the root fails by its exit code`, async () => {
  const bin = standIns();
  const lint = async (root: string, changed: string, output: string) => {
    const paths = repoPaths(root, testEnv());
    const { profile } = ensureProfile(paths);
    const work = createWork(paths, "fix");
    write(root, changed, "changed by the item\n");
    const env = { ...childEnv(), PATH: `${bin}:/usr/bin:/bin`, CREW_TEST_LINT: output };
    const outcome = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["lint"], env });
    return outcome.evidence.runs.filter((r) => r.gate === "lint");
  };
  const clippy = (file: string) =>
    `warning: unused variable: \`y\`\\n --> ${file}:3:5\\n  |\\n3 |     let y = 1;\\n\\nerror: could not compile \`app\`\\n`;
  const rust = () =>
    makeRepo({ "Cargo.toml": CRATE("app"), "src/old.rs": "// old\n", "src/a.rs": "// a\n" });
  const [debt] = await lint(rust(), "src/a.rs", clippy("src/old.rs"));
  expect(debt).toMatchObject({
    status: "pass",
    command: CLIPPY,
    reason: "1 file with problems, none changed by this item (pre-existing)",
    problems: { touched: [], untouched: 1 },
  });
  const [own] = await lint(rust(), "src/a.rs", `${clippy("src/old.rs")}${clippy("src/a.rs")}`);
  expect(own).toMatchObject({
    status: "fail",
    reason: "problems in files this item changed: src/a.rs; 1 untouched file also",
    problems: { touched: ["src/a.rs"], untouched: 1 },
  });
  const vet = (file: string) =>
    `# example.com/m\\n# [example.com/m]\\n./${file}:5:2: fmt.Printf format %%d has arg \\"x\\" of wrong type string\\n`;
  const go = () =>
    makeRepo({ "go.mod": GO_MOD, "old.go": "package main\n", "a.go": "package main\n" });
  const [goDebt] = await lint(go(), "a.go", vet("old.go"));
  expect(goDebt).toMatchObject({
    status: "pass",
    command: "go vet ./...",
    reason: "1 file with problems, none changed by this item (pre-existing)",
    problems: { touched: [], untouched: 1 },
  });
  const [goOwn] = await lint(go(), "a.go", vet("a.go"));
  expect(goOwn).toMatchObject({
    status: "fail",
    reason: "problems in files this item changed: a.go",
    problems: { touched: ["a.go"], untouched: 0 },
  });
  // A workspace under backend/: rustc names a file from the workspace's root. The root's own gate
  // finds it; the member's, run in the member's folder, finds no file and is judged by its exit code.
  const nested = makeRepo({
    "backend/Cargo.toml": '[workspace]\nmembers = ["crates/*"]\n',
    "backend/crates/core/Cargo.toml": CRATE("core"),
    "backend/crates/core/src/old.rs": "// old\n",
    "backend/crates/core/src/a.rs": "// a\n",
  });
  const runs = await lint(nested, "backend/crates/core/src/a.rs", clippy("crates/core/src/old.rs"));
  expect(runs.map((r) => r.target).sort()).toEqual(["backend", "backend/crates/core"]);
  const at = (target: string) => runs.find((r) => r.target === target);
  expect(at("backend")).toMatchObject({
    status: "pass",
    command: "cargo clippy --workspace --all-targets -- -D warnings",
    problems: { touched: [], untouched: 1 },
  });
  expect(at("backend/crates/core")).toMatchObject({ status: "fail", command: CLIPPY });
  expect(at("backend/crates/core")?.problems).toBeUndefined();
});

test(`${ITEM} AC-16: a change to a Go or a Rust manifest plans no audit, and a listed manifest changed under a root Go or Rust target plans the audit on that target on the full route alone, where no tool answers`, () => {
  const deps = (route: "standard" | "full", root: string, changed: string[]) =>
    plannedGates(route, detectProfile(root), DEFAULT_POLICY, changed, root)
      .filter((g) => g.gate === "deps")
      .map((g) => g.target);
  const cases: [string, Record<string, string>, string[], string][] = [
    ["go", { "go.mod": GO_MOD, "go.sum": "" }, ["go.mod", "go.sum"], "no audit tool for go"],
    [
      "rust",
      { "Cargo.toml": CRATE("app"), "Cargo.lock": "" },
      ["Cargo.toml", "Cargo.lock"],
      "no audit tool for cargo",
    ],
  ];
  for (const [stack, files, manifests, reason] of cases) {
    const root = tempDir(`crew-${stack}-`);
    for (const [rel, text] of Object.entries(files)) write(root, rel, text);
    write(root, "web/package.json", JSON.stringify({ scripts: { test: "exit 0" } }));
    const profile = detectProfile(root);
    expect(profile.targets.map((t) => `${t.path}:${t.stack}`)).toEqual([`.:${stack}`, "web:node"]);
    for (const route of ["standard", "full"] as const) {
      for (const file of manifests)
        expect({ file, planned: deps(route, root, [file]) }).toEqual({ file, planned: [] });
      expect(deps(route, root, manifests)).toEqual([]);
      expect(deps(route, root, ["main.go", "src/lib.rs"])).toEqual([]);
    }
    const target = profile.targets[0];
    if (!target) throw new Error("no target");
    expect(depsAuditCommand(target, root)).toEqual({ reason });
    // The standard route leaves the gate out where no tool exists; the full route plans it.
    expect(deps("standard", root, ["web/package.json"])).not.toContain(".");
    expect(deps("full", root, ["web/package.json"])).toContain(".");
  }
});
