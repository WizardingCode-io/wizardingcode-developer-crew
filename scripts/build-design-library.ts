#!/usr/bin/env bun
// Vendors the open design data into `plugins/core/design/library/` (item 2026-10-30-005, D-3): data
// only, each row with its source and licence, each file pinned by hash in NOTICE.json. Run by hand
// from checkouts of the sources; nothing here runs at install or at runtime, and nothing is fetched.
//   bun scripts/build-design-library.ts --taste <folder> --garden <folder> --scroll <folder> --tastemaker <folder>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  DISPLAY_MAX_PX,
  DISPLAY_MAX_VW,
  type LibraryRow,
  scanLibraryRow,
} from "../packages/engine/src/design.ts";
import { sha256 } from "../packages/engine/src/fs.ts";

const arg = (name: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  const value = at < 0 ? undefined : process.argv[at + 1];
  if (!value) throw new Error(`usage: --${name} <folder>`);
  return value;
};
const OUT = join(import.meta.dir, "..", "plugins", "core", "design", "library");
const TASTE = { source: "Leonxlnx/taste-skill", licence: "MIT", commit: "b9ca2fd" };
const GARDEN = { source: "ConardLi/garden-skills", licence: "MIT", commit: "2b9a893" };
const SCROLL = { source: "nateherkai/scroll-craft", licence: "MIT", commit: "75d81f7" };
const MAKER = { source: "codeswithroh/tastemaker", licence: "MIT", commit: "792a28a" };

// The fonts and looks the crew refuses by default (the union of the sources' lists): a row built on one is not dealt.
const OVERUSED_FONTS =
  /^(Inter|Inter Tight|Roboto|Open Sans|Lato|Montserrat|Poppins|Arial|Helvetica|Fraunces|Playfair Display|Cormorant|Lora|Crimson|Newsreader|Syne|Space Grotesk|Space Mono|IBM Plex.*|DM Sans|DM Serif.*|Outfit|Plus Jakarta Sans|Instrument Sans|Instrument Serif|Geist.*|Mona Sans|Recoleta|Sora|Nunito|Raleway)$/i;
const AI_HEXES =
  /#(6366f1|8b5cf6|7c3aed|a855f7|4f46e5|a78bfa|818cf8|9333ea|6d28d9|c084fc|d97757|da7756|c15f3c|cc785c|bd5d3a|f0eee6|faf9f5|f5f4ed|eeece2|e8e6dc)\b/i;

/** Type sizes brought to the proportion limits (D-5 outranks the source). */
function proportioned(text: string): string {
  return text
    .replace(/clamp\(([^)]*)\)/gi, (whole, inner: string) =>
      /vw/.test(inner)
        ? inner
            .replace(
              /(\d+(?:\.\d+)?)px/g,
              (_: string, n: string) => `${Math.min(Number(n), DISPLAY_MAX_PX)}px`,
            )
            .replace(
              /(\d+(?:\.\d+)?)rem/g,
              (_: string, n: string) => `${Math.min(Number(n), DISPLAY_MAX_PX / 16)}rem`,
            )
            .replace(
              /(\d+(?:\.\d+)?)vw/g,
              (_: string, n: string) => `${Math.min(Number(n), DISPLAY_MAX_VW)}vw`,
            )
            .replace(/^/, "clamp(")
            .replace(/$/, ")")
        : whole,
    )
    .replace(
      /\b(at|set at|size|sized)\s+(\d{3,})px/gi,
      (_: string, w: string) => `${w} ${DISPLAY_MAX_PX}px`,
    )
    .replace(/\s*Recipe: [^.]*\.(?:md)?\.?/g, "")
    .replace(/\s*\(?(?:see |in )?references\/[a-z-]+\.md[^.]*\)?/gi, "");
}

function deepText<T>(value: T): T {
  if (typeof value === "string") return proportioned(value) as T;
  if (Array.isArray(value)) return value.map(deepText) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepText(v)])) as T;
  return value;
}

const dropped: Record<string, string[]> = {};
function keep(file: string, rows: LibraryRow[]): LibraryRow[] {
  return rows.flatMap((raw) => {
    const row = deepText(raw);
    const problems = scanLibraryRow(row);
    if (!problems.length) return [row];
    dropped[file] ??= [];
    dropped[file].push(`${row.id}: ${problems.join("; ")}`);
    return [];
  });
}

const taste = (name: string): Record<string, unknown>[] =>
  JSON.parse(readFileSync(join(arg("taste"), "library", `${name}.json`), "utf8"));
const stamped = (
  rows: Record<string, unknown>[],
  from: { source: string; licence: string },
  omit: string[],
) =>
  rows.map((r) => {
    const row = Object.fromEntries(Object.entries(r).filter(([k]) => !omit.includes(k)));
    return { ...row, id: String(r.id), source: from.source, licence: from.licence } as LibraryRow;
  });

const OMIT = [
  "links",
  "standsInFor",
  "seenIn",
  "seen",
  "sites",
  "references",
  "photos",
  "example",
  "examples",
];
const typeRows = taste("type")
  .filter((t) => {
    const family = (k: string) => String((t[k] as { family?: string } | undefined)?.family ?? "");
    return !OVERUSED_FONTS.test(family("display")) && !OVERUSED_FONTS.test(family("text"));
  })
  .map((t) => {
    const clean = (k: string) => {
      const { css: _css, ...rest } = (t[k] ?? {}) as Record<string, unknown>;
      return rest;
    };
    return { ...t, display: clean("display"), text: clean("text") };
  });
const paletteRows = taste("palettes").filter((p) => !AI_HEXES.test(JSON.stringify(p)));

/** A recipe distilled to its values: the brand it was named after, its touchstones and its image prompt stay out. */
function recipes(): LibraryRow[] {
  const dir = join(arg("garden"), "skills", "web-design-engineer", "references", "style-recipes");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "INDEX.md")
    .sort()
    .flatMap((file, index) => {
      const brand = basename(file, ".md").replace(/-/g, "[- ]?");
      const text = readFileSync(join(dir, file), "utf8");
      const school = /\*\*School\*\*:\s*(.+)/.exec(text)?.[1]?.trim() ?? "";
      const part = (name: string): string => {
        const inline = new RegExp(`\\*\\*${name}\\*\\*:\\s*(.+)`).exec(text);
        if (inline) return inline[1]?.trim() ?? "";
        const block = new RegExp(`\\*\\*${name}\\*\\*\\n((?:- .+\\n?)+)`).exec(text);
        return block?.[1]?.trim() ?? "";
      };
      const scrub = (s: string) =>
        s.replace(new RegExp(`\\b${brand}(?:'s)?\\b`, "gi"), "the style").replace(/`/g, "");
      const body = {
        school: scrub(school),
        palette: scrub(part("Palette")),
        typography: scrub(part("Typography")),
        spacing: scrub(part("Spacing")),
        radius: scrub(part("Radius")),
        shadow: scrub(part("Shadow")),
        motion: scrub(part("Motion")),
        signature: scrub(part("Signature moves")),
        avoid: scrub(part("Avoid")),
        notWhen: scrub(part("Don't use when")),
      };
      return AI_HEXES.test(JSON.stringify(body))
        ? []
        : [{ id: `recipe-${index + 1}`, source: GARDEN.source, licence: GARDEN.licence, ...body }];
    });
}

function grammars(): LibraryRow[] {
  const text = readFileSync(
    join(
      arg("scroll"),
      "plugins",
      "nateherk-design",
      "skills",
      "scroll-craft",
      "references",
      "uniqueness.md",
    ),
    "utf8",
  );
  const out: LibraryRow[] = [];
  const parts = text.split(/^### 2\.\d+ /m).slice(1, 9);
  for (const part of parts) {
    const name = (part.split("\n")[0] ?? "").trim();
    const field = (label: string): string =>
      new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\n|\\*\\*[A-Z][a-z, ]+:\\*\\*|$)`)
        .exec(part)?.[1]
        ?.replace(/\s+/g, " ")
        .replace(/`/g, "")
        .trim() ?? "";
    out.push({
      id: `grammar-${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+$/, "")}`,
      source: SCROLL.source,
      licence: SCROLL.licence,
      name,
      fits: field("Fits"),
      feels: field("The scroll feels like"),
      forbids: field("Forbids"),
      frame: field("Nav, hero, close"),
    });
  }
  return out;
}

function macrostructures(): LibraryRow[] {
  const text = readFileSync(
    join(arg("tastemaker"), "skills", "tastemaker", "references", "macrostructures.md"),
    "utf8",
  );
  return [...text.matchAll(/^- \*\*(\d+) · ([^*]+)\*\* — (.+)$/gm)].map((m) => ({
    id: `macro-${(m[2] ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+$/, "")}`,
    source: MAKER.source,
    licence: MAKER.licence,
    name: (m[2] ?? "").trim(),
    text: (m[3] ?? "")
      .replace(/`/g, "")
      .replace(/\*/g, "")
      .replace(/\s*\(?references\/[^\s)]*\)?/g, " "),
  }));
}

const files: Record<string, { rows: LibraryRow[]; from: typeof TASTE }> = {
  directions: { rows: stamped(taste("directions"), TASTE, OMIT), from: TASTE },
  heroes: { rows: stamped(taste("heroes"), TASTE, OMIT), from: TASTE },
  sections: { rows: stamped(taste("sections"), TASTE, OMIT), from: TASTE },
  palettes: { rows: stamped(paletteRows, TASTE, OMIT), from: TASTE },
  type: { rows: stamped(typeRows, TASTE, OMIT), from: TASTE },
  motions: { rows: stamped(taste("motions"), TASTE, OMIT), from: TASTE },
  recipes: { rows: recipes(), from: GARDEN },
  grammars: { rows: grammars(), from: SCROLL },
  macrostructures: { rows: macrostructures(), from: MAKER },
};

mkdirSync(OUT, { recursive: true });
const notice = {
  note: "Open design data vendored at build time (ADR 0017, item 2026-10-30-005). Each source's MIT licence applies to its rows; the notices are below. No code runs from here and nothing is fetched. Photos and third-party site names are left out; type sizes are brought to the crew's proportion limits.",
  files: [] as { file: string; rows: number; sha256: string; sources: unknown[] }[],
  copyright: {
    "Leonxlnx/taste-skill": "Copyright (c) 2026 Leonxlnx",
    "ConardLi/garden-skills": "Copyright (c) ConardLi",
    "nateherkai/scroll-craft": "Copyright (c) nateherkai",
    "codeswithroh/tastemaker": "Copyright (c) codeswithroh",
  },
  licence:
    "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the Software), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND.",
};
for (const [name, { rows, from }] of Object.entries(files)) {
  const kept = keep(name, rows);
  const body = `${JSON.stringify(kept, null, 1)}\n`;
  const file = `${name}.json`;
  writeFileSync(join(OUT, file), body);
  notice.files.push({ file, rows: kept.length, sha256: sha256(body), sources: [from] });
  console.log(
    `${file}: ${kept.length} of ${rows.length}${dropped[name] ? `, dropped ${dropped[name].length}` : ""}`,
  );
}
writeFileSync(join(OUT, "NOTICE.json"), `${JSON.stringify(notice, null, 1)}\n`);
for (const [name, list] of Object.entries(dropped))
  for (const line of list.slice(0, 6)) console.log(`  ${name} ${line.slice(0, 120)}`);
