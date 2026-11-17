/**
 * What a frontend change declares and what its design choices stand on (item 2026-11-16-008, the
 * frontend team's rules 10 and 11): the project's kind and primary metric, one record per project,
 * and the item's choices, each with one of five proof labels. Both files are the engine's. A record
 * is checked when it is read as well as when it is written, against a closed schema, so a file
 * changed outside the engine reads as absent instead of being believed. Every text a command takes
 * is untrusted: one line, under its cap, stored as given, never evaluated, fetched or made a path.
 */
import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { designDir, REASON_MAX } from "./design.ts";
import { ensureDir } from "./fs.ts";
import type { CrewPaths } from "./paths.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";

export const KINDS = [
  "info-product",
  "e-commerce",
  "saas-marketing",
  "product-ui",
  "institutional",
  "donations",
  "brand",
  "content-media",
  "mobile-app",
  "b2b-lead-gen",
] as const;
export type Kind = (typeof KINDS)[number];
/** The eleventh word: a project that fits none of the ten, declared with its own name. */
export const KIND_OTHER = "other";

/** The primary metric the team's definition gives each kind (section 1); what the Strategy skill proposes, never what the engine imposes. */
export const KIND_METRICS: Record<Kind, string> = {
  "info-product": "conversion rate per unique visitor",
  "e-commerce": "conversion rate per session",
  "saas-marketing": "visitor-to-trial, or the demo request",
  "product-ui": "activation",
  institutional: "task completion",
  donations: "donation conversion",
  brand: "the enquiry or contact",
  "content-media": "page views per session",
  "mobile-app": "download-to-trial",
  "b2b-lead-gen": "the qualified lead",
};

export const LABELS = [
  "norm",
  "platform-guidance",
  "published-study",
  "measured-here",
  "hypothesis",
] as const;
export type Label = (typeof LABELS)[number];

/** The caps of the texts, in characters. */
export const CAPS = {
  metric: 200,
  name: 60,
  choice: 500,
  source: 300,
  replication: 300,
  reason: REASON_MAX,
  evidence: 300,
} as const;
export const EARLIER_MAX = 20;
export const CHOICES_MAX = 100;
export const HISTORY_MAX = 10;
const AT_MAX = 40;

export interface KindEntry {
  kind: string;
  name?: string;
  metric: string;
  at: string;
}
export interface KindRecord extends KindEntry {
  reason?: string;
  earlier: KindEntry[];
}

export interface ChoiceEarlier {
  label: Label;
  source?: string;
  replication?: string;
  evidence?: string;
  reason?: string;
  at: string;
}
export interface Choice extends ChoiceEarlier {
  id: string;
  text: string;
  history: ChoiceEarlier[];
}

export type Done<T> = ({ ok: true } & T) | { ok: false; why: string };
const no = (why: string): { ok: false; why: string } => ({ ok: false, why });

// Line breaks, the C0 and C1 controls, the zero-width marks and the bidi controls: what `quotedText`
// strips from a text it prints is refused here before it is stored.
const NOT_ONE_LINE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is refused
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;

/** Why a text cannot be stored, or null: empty, over its cap, or not one line of plain characters. */
export function textRefusal(flag: string, value: string | undefined, cap: number): string | null {
  if (value === undefined || !value.trim()) return `${flag} is empty`;
  if (NOT_ONE_LINE.test(value)) return `${flag}: one line, no control characters`;
  if (value.length > cap) return `${flag} is over ${cap} characters`;
  return null;
}

/** The text itself once it passed `textRefusal`, so a caller holds a string. */
function storable(flag: string, value: string | undefined, cap: number): Done<{ text: string }> {
  if (value === undefined) return no(`${flag} is empty`);
  const why = textRefusal(flag, value, cap);
  return why === null ? { ok: true, text: value } : no(why);
}

/** The label a command was given, or null when it is none of the five. */
function labelOf(value: string | undefined): Label | null {
  return LABELS.find((l) => l === value) ?? null;
}
const NOT_A_LABEL = `--label is one of: ${LABELS.join(", ")}`;

const isText = (value: unknown, cap: number): value is string =>
  typeof value === "string" && textRefusal("", value, cap) === null;
const onlyKeys = (value: object, keys: readonly string[]): boolean =>
  Object.keys(value).every((k) => keys.includes(k));
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function validKindEntry(value: unknown, keys: readonly string[]): boolean {
  if (!isObject(value) || !onlyKeys(value, keys)) return false;
  const other = value.kind === KIND_OTHER;
  if (!other && !(KINDS as readonly unknown[]).includes(value.kind)) return false;
  if (other ? !isText(value.name, CAPS.name) : value.name !== undefined) return false;
  return isText(value.metric, CAPS.metric) && isText(value.at, AT_MAX);
}

function validKindRecord(value: unknown): value is KindRecord {
  if (!validKindEntry(value, ["kind", "name", "metric", "at", "reason", "earlier"])) return false;
  const record = value as Record<string, unknown>;
  if (record.reason !== undefined && !isText(record.reason, CAPS.reason)) return false;
  return (
    Array.isArray(record.earlier) &&
    record.earlier.length <= EARLIER_MAX &&
    record.earlier.every((e) => validKindEntry(e, ["kind", "name", "metric", "at"]))
  );
}

export function projectKindFile(paths: CrewPaths): string {
  return join(paths.crewDir, "design-project.json");
}

/** The project's kind, or none: a file changed outside the engine, or outside the schema, is not trusted and reads as absent. */
export function readKind(paths: CrewPaths): { record: KindRecord | null; untrusted: boolean } {
  const read = readProtectedJson<unknown>(paths, projectKindFile(paths));
  if (read.data === null && !read.tampered) return { record: null, untrusted: false };
  if (read.tampered || !validKindRecord(read.data)) return { record: null, untrusted: true };
  return { record: read.data, untrusted: false };
}

export interface KindInput {
  kind: string;
  name?: string;
  metric?: string;
  reason?: string;
}

/** Declares the project's kind. Over a trusted record it asks for a reason and keeps what it replaces; over one not trusted it starts again. */
export function declareKind(
  paths: CrewPaths,
  input: KindInput,
  at: string,
): Done<{ record: KindRecord }> {
  const other = input.kind === KIND_OTHER;
  if (!other && !(KINDS as readonly string[]).includes(input.kind))
    return no(`the kind is one of: ${[...KINDS, KIND_OTHER].join(", ")}`);
  if (other) {
    const why = textRefusal("--name", input.name, CAPS.name);
    if (why) return no(`${why} (other takes --name "<the kind>")`);
  } else if (input.name !== undefined) return no("--name goes with other, not with one of the ten");
  // With no metric the refusal proposes the kind's usual one (section 1 of the definition); the
  // project's own is still the person's to write.
  if (input.metric === undefined && !other)
    return no(
      `--metric is required: the usual one of ${input.kind} is --metric "${KIND_METRICS[input.kind as Kind]}"`,
    );
  const metric = storable("--metric", input.metric, CAPS.metric);
  if (!metric.ok) return metric;
  const current = readKind(paths).record;
  if (current) {
    if (input.reason === undefined)
      return no(`a kind is already recorded (${current.kind}): give --reason to change it`);
    const reason = textRefusal("--reason", input.reason, CAPS.reason);
    if (reason) return no(reason);
  }
  const entry = (r: KindEntry): KindEntry => ({
    kind: r.kind,
    ...(r.name === undefined ? {} : { name: r.name }),
    metric: r.metric,
    at: r.at,
  });
  const record: KindRecord = {
    ...entry({ kind: input.kind, name: input.name, metric: metric.text, at }),
    ...(current ? { reason: input.reason } : {}),
    earlier: current ? [...current.earlier, entry(current)].slice(-EARLIER_MAX) : [],
  };
  ensureDir(paths.crewDir);
  writeProtectedJson(paths, projectKindFile(paths), record);
  return { ok: true, record };
}

const UNDER_ENGINE = /^\.(?:crew|git)(?:\/|$)/i;

/**
 * The file a measurement stands in, as the path stored for it: a regular file inside the project,
 * by real path, never a link, never under `.crew/` or `.git/`. The file's content is never read.
 */
export function evidencePath(root: string, given: string | undefined): Done<{ path: string }> {
  const refuse = (why: string) =>
    no(`--evidence ${why} (a regular file inside the project holds the measurement)`);
  const shape = textRefusal("--evidence", given, CAPS.evidence);
  if (shape || given === undefined) return no(shape ?? "--evidence is empty");
  let real: string;
  try {
    real = realpathSync(root);
  } catch {
    return refuse("cannot be checked: the project's root cannot be read");
  }
  const abs = isAbsolute(given) ? resolve(given) : resolve(real, given);
  const rel = relative(real, abs).split(sep).join("/");
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return refuse("is outside the project");
  if (UNDER_ENGINE.test(rel)) return refuse("is under .crew/ or .git/");
  try {
    const stat = lstatSync(abs);
    if (stat.isSymbolicLink()) return refuse("is a symbolic link");
    if (!stat.isFile()) return refuse("is not a regular file");
    if (realpathSync(dirname(abs)) !== dirname(abs))
      return refuse("has a symbolic link in its path");
  } catch {
    return refuse("names no file");
  }
  return { ok: true, path: rel };
}

const CHOICE_ID = /^DC-[1-9]\d{0,3}$/;
const EARLIER_KEYS = ["label", "source", "replication", "evidence", "reason", "at"] as const;

function validEarlier(value: unknown, keys: readonly string[]): boolean {
  if (!isObject(value) || !onlyKeys(value, keys)) return false;
  if (!(LABELS as readonly unknown[]).includes(value.label)) return false;
  const optional: [unknown, number][] = [
    [value.source, CAPS.source],
    [value.replication, CAPS.replication],
    [value.evidence, CAPS.evidence],
    [value.reason, CAPS.reason],
  ];
  return (
    optional.every(([text, cap]) => text === undefined || isText(text, cap)) &&
    isText(value.at, AT_MAX)
  );
}

function validChoice(value: unknown): value is Choice {
  if (!validEarlier(value, [...EARLIER_KEYS, "id", "text", "history"])) return false;
  const choice = value as Record<string, unknown>;
  return (
    typeof choice.id === "string" &&
    CHOICE_ID.test(choice.id) &&
    isText(choice.text, CAPS.choice) &&
    Array.isArray(choice.history) &&
    choice.history.length <= HISTORY_MAX &&
    choice.history.every((h) => validEarlier(h, EARLIER_KEYS))
  );
}

function validChoices(value: unknown): value is { choices: Choice[] } {
  return (
    isObject(value) &&
    onlyKeys(value, ["choices"]) &&
    Array.isArray(value.choices) &&
    value.choices.length <= CHOICES_MAX &&
    value.choices.every(validChoice)
  );
}

export function choicesFile(paths: CrewPaths, id: string): string {
  return join(designDir(paths, id), "choices.json");
}

/** The item's choices; a file that exists and is not trusted reads as none, and says so. */
export function readChoices(
  paths: CrewPaths,
  id: string,
): { choices: Choice[]; untrusted: boolean } {
  const read = readProtectedJson<unknown>(paths, choicesFile(paths, id));
  if (read.data === null && !read.tampered) return { choices: [], untrusted: false };
  if (read.tampered || !validChoices(read.data)) return { choices: [], untrusted: true };
  return { choices: read.data.choices, untrusted: false };
}

function saveChoices(paths: CrewPaths, id: string, choices: Choice[]): void {
  ensureDir(designDir(paths, id));
  writeProtectedJson(paths, choicesFile(paths, id), { choices });
}

const NOT_TRUSTED = (id: string) => `choices.json is not trusted (crew accept ${id})`;

export interface ChoiceInput {
  text?: string;
  label?: string;
  source?: string;
  replication?: string;
  evidence?: string;
}

/** Records a design choice with its label and what the label asks: a source, a replication note, or the file of a measurement. */
export function addChoice(
  paths: CrewPaths,
  id: string,
  input: ChoiceInput,
  at: string,
): Done<{ choice: Choice }> {
  const label = labelOf(input.label);
  if (!label) return no(NOT_A_LABEL);
  const text = storable("the choice", input.text, CAPS.choice);
  if (!text.ok) return text;
  const needsSource =
    label === "norm" || label === "platform-guidance" || label === "published-study";
  if (needsSource || input.source !== undefined) {
    const why = textRefusal("--source", input.source, CAPS.source);
    if (why) return no(`${why} (${label} takes --source "<where it stands>")`);
  }
  if (label === "published-study") {
    const why = textRefusal("--replication", input.replication, CAPS.replication);
    if (why)
      return no(`${why} (published-study takes --replication "<who repeated it, or nobody>")`);
  } else if (input.replication !== undefined)
    return no("--replication goes with published-study alone");
  let evidence: string | undefined;
  if (label === "measured-here") {
    const found = evidencePath(paths.root, input.evidence);
    if (!found.ok) return found;
    evidence = found.path;
  } else if (input.evidence !== undefined) return no("--evidence goes with measured-here alone");
  const held = readChoices(paths, id);
  if (held.untrusted) return no(NOT_TRUSTED(id));
  if (held.choices.length >= CHOICES_MAX) return no(`an item holds at most ${CHOICES_MAX} choices`);
  const choice: Choice = {
    id: `DC-${held.choices.length + 1}`,
    text: text.text,
    label,
    ...(input.source === undefined ? {} : { source: input.source }),
    ...(input.replication === undefined ? {} : { replication: input.replication }),
    ...(evidence === undefined ? {} : { evidence }),
    at,
    history: [],
  };
  saveChoices(paths, id, [...held.choices, choice]);
  return { ok: true, choice };
}

export interface RelabelInput {
  label?: string;
  reason?: string;
  evidence?: string;
}

/** A label moves down to a hypothesis, with a reason, or to a measurement, with its file; nothing else moves it. */
export function relabelChoice(
  paths: CrewPaths,
  id: string,
  choiceId: string,
  input: RelabelInput,
  at: string,
): Done<{ choice: Choice }> {
  const label = labelOf(input.label);
  if (!label) return no(NOT_A_LABEL);
  const held = readChoices(paths, id);
  if (held.untrusted) return no(NOT_TRUSTED(id));
  const index = held.choices.findIndex((c) => c.id === choiceId);
  const current = held.choices[index];
  if (!current) return no(`no choice ${choiceId}`);
  let moved: Pick<Choice, "label" | "reason" | "evidence">;
  if (label === "hypothesis") {
    if (current.label === "hypothesis") return no(`${choiceId} is already a hypothesis`);
    if (input.reason === undefined) return no("give --reason to take a label down to a hypothesis");
    const why = textRefusal("--reason", input.reason, CAPS.reason);
    if (why) return no(why);
    moved = { label, reason: input.reason };
  } else if (label === "measured-here") {
    const found = evidencePath(paths.root, input.evidence);
    if (!found.ok) return found;
    moved = { label, evidence: found.path };
  } else return no("a label never upgrades without a measurement");
  if (current.history.length >= HISTORY_MAX)
    return no(`${choiceId} was relabelled ${HISTORY_MAX} times: record a new choice`);
  const { id: _id, text: _text, history, ...earlier } = current;
  const choice: Choice = {
    id: current.id,
    text: current.text,
    ...moved,
    at,
    history: [...history, earlier],
  };
  saveChoices(
    paths,
    id,
    held.choices.map((c, i) => (i === index ? choice : c)),
  );
  return { ok: true, choice };
}

/** The measured choices whose file no longer holds: gone, or replaced by a link or a folder. */
export function staleEvidence(paths: CrewPaths, choices: readonly Choice[]): Choice[] {
  return choices.filter(
    (c) => c.label === "measured-here" && !evidencePath(paths.root, c.evidence).ok,
  );
}
