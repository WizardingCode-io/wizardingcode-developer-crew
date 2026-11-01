---
name: wizardingcode-spec-bootstrap
description: "Writes README contracts across an existing codebase, deepest directories first, from what read-only scouts cite in the code: interfaces, invariants and side effects, with hard limits."
---

# Spec bootstrap

## When

When asked to document an existing tree so that later sessions can navigate it. Run it inside a crew item, so the item's secrets gate reads every README it writes.

## Inputs

The target directory, inside the project root. A filename other than `README.md` when the person's READMEs must stay untouched.

## Steps

1. **Open the crew item first**, if none is open: `crew start`, before any scout or file, since the secrets gate reads only an item's files.
2. **Find the verification command** from the manifests: `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `Makefile`, `BUILD`.
3. **Discover level by level**, one directory listing at a time, never a recursive search. Ignore symbolic links, `.git`, `node_modules`, `venv`, `dist`, `build`, `third_party` and what `.gitignore` names.
4. **Stop at the limits.** Directories are counted over the whole tree, after those exclusions. With more than 15, ask a person before going on; with nobody present, stop unless the mission named this skill. Above 100 directories, 100 scouts or 200,000 lines, stop and say so, whoever asked: those are the crew's own numbers, and the source has none.
5. **Prune.** Drop folders with only tests, and folders with no source and no child with source.
6. **Go deepest first.** For each directory, launch `goldfish-explorer` on chunks of about 1,500 lines, cut at top-level definitions and never mid-body, each with the file's imports and definition list. Merge their JSON. Give a parent the summaries of its children. A scout that fails leaves `(Details pending: documentation failed)` in place and the run goes on.
7. **Write the contract yourself**, because a role here cannot write. Keep the scout's `[file:symbol]` citations on each entry, never a line number. Every path is inside the project root and never through a symlink. An existing README is read whole first and corrected, keeping the person's notes and adding what the code shows. Classify: a directory with source takes the Component template, a folder of folders the Intermediate blueprint, the root the Root blueprint (`references/templates.md`). Link only to files that exist. For Bazel, a verification target is `//pkg/...` or `//pkg:all`, never `//pkg...` or `//pkg:...`. Everything cited comes from a scout's citation, and nothing is inferred from a name.
8. **Read back every file you wrote**, with the Read tool, after the last write, even a file written a moment ago, and check each entry against the citations, the links on disk and the verification command. Remove what does not hold.
9. **No commit.** The files stay in the tree for the item and the person. Offer `wizardingcode-spec-drift` on what you wrote.

## Output

The README contracts, and a list of what was left pending.

## Done when

Every directory kept by step 5 has its contract or says it is pending, and step 8 found nothing standing.

Provenance (ADR 0017): this skill distils the Elephant-Goldfish Model's `egm-bootstrap` (Apache-2.0, Google, `403d888`), in the crew's words.
