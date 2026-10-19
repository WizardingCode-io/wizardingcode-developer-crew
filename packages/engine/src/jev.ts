import { readFileSync } from "node:fs";
import type { UserConfig } from "./types.ts";

/**
 * Where Jev is reached (SP7 §11, SP3 decision 8): the key from the environment alone, the endpoint
 * and the model from the environment, else the user's config, else the defaults; `refused` names
 * why an endpoint may not carry the key (security review of SP3 Task 6).
 */
export interface JevConfig {
  key: string | null;
  endpoint: string;
  model: string;
  /** The path of a canned answers file when the endpoint is `file://…` (the tests and the evals). */
  canned: string | null;
  configured: boolean;
  refused: string | null;
}

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const JEV_MODEL = "jev-latest";
export const JEV_KEY_VARIABLE = "WIZARDINGCODE_JEV_API_KEY";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * An endpoint the key may travel to: `https://`, or `http://` to a loopback host, never with
 * userinfo; or a `file://` path for the canned transport. Null when allowed, else the reason.
 */
export function endpointRefusal(endpoint: string): string | null {
  if (endpoint.startsWith("file://"))
    return endpoint.length > "file://".length ? null : "file:// needs a path";
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "not a URL";
  }
  if (url.username || url.password) return "an endpoint carries no userinfo";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return null;
  return "the key travels over https (http only to a loopback host)";
}

export function jevConfig(env: NodeJS.ProcessEnv, config: UserConfig): JevConfig {
  const key = env[JEV_KEY_VARIABLE]?.trim() || null;
  const endpoint = env.WIZARDINGCODE_JEV_ENDPOINT?.trim() || config.jev?.endpoint || JEV_ENDPOINT;
  const model = env.WIZARDINGCODE_JEV_MODEL?.trim() || config.jev?.model || JEV_MODEL;
  const refused = endpointRefusal(endpoint);
  const canned =
    refused === null && endpoint.startsWith("file://") ? endpoint.slice("file://".length) : null;
  return {
    key,
    endpoint,
    model,
    canned,
    configured: key !== null || canned !== null,
    refused,
  };
}

/** The three primitives as the API takes them: a noul (yes or no), a choice (one of a set), a score (a level of an ordered list). */
export type JevQuestion =
  | { type: "noul"; instructions: unknown; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: unknown; criteria: Record<string, unknown> }
  | { type: "score"; instructions: unknown; criteria: unknown[] };

export interface JevRequest {
  state: unknown;
  questions: Record<string, JevQuestion>;
}

export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | {
      type: "score";
      score: number;
      legend: Record<string, string>;
      probabilities: Record<string, number>;
      confidence: number;
    };

export type JevResult =
  | {
      ok: true;
      answers: Record<string, JevAnswer>;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    }
  | { ok: false; unavailable: string };

export interface AskOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const RETRY_MS = [1000, 2000];

/** A reason fit for a record: the key's value never, the endpoint's secrets never, one line, 200 characters. */
export function redact(text: string, cfg: Pick<JevConfig, "key" | "endpoint">): string {
  let out = text;
  try {
    const url = new URL(cfg.endpoint);
    const bare = `${url.protocol}//${url.host}${url.pathname}`;
    if (url.username || url.password || url.search) out = out.split(cfg.endpoint).join(bare);
    if (url.username || url.password) out = out.split(`${url.username}:${url.password}@`).join("");
    if (url.search) out = out.split(url.search).join("");
  } catch {
    // not a URL: nothing of it to remove
  }
  if (cfg.key) out = out.split(cfg.key).join("[key]");
  return out.replace(/\s+/g, " ").trim().slice(0, 200);
}

function isAnswer(value: unknown, type: JevQuestion["type"]): value is JevAnswer {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  if (a.type !== type) return false;
  if (type === "noul") return typeof a.noul === "number" && Number.isFinite(a.noul);
  if (
    typeof a.confidence !== "number" ||
    typeof a.probabilities !== "object" ||
    a.probabilities === null
  )
    return false;
  if (type === "choice") return typeof a.choice === "string";
  return typeof a.score === "number" && typeof a.legend === "object" && a.legend !== null;
}

/** The answers checked one by one against the questions asked: a shape the API did not promise is a malformed answer. */
function takeAnswers(
  raw: unknown,
  questions: Record<string, JevQuestion>,
  source: "api" | "file",
): { taken: Record<string, JevAnswer> } | { unavailable: string } {
  if (typeof raw !== "object" || raw === null) return { unavailable: "malformed answer" };
  const answers = raw as Record<string, unknown>;
  const taken: Record<string, JevAnswer> = {};
  for (const [id, question] of Object.entries(questions)) {
    const answer = answers[id];
    if (answer === undefined)
      return { unavailable: source === "file" ? `no canned answer for ${id}` : "malformed answer" };
    if (!isAnswer(answer, question.type))
      return {
        unavailable:
          source === "file"
            ? `canned answer for ${id} is not a ${question.type}`
            : "malformed answer",
      };
    taken[id] = answer;
  }
  return { taken };
}

function canned(cfg: JevConfig, request: JevRequest): JevResult {
  const path = cfg.canned ?? "";
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { ok: false, unavailable: `canned answers unreadable: ${path}` };
  }
  const answers = takeAnswers(raw, request.questions, "file");
  if ("unavailable" in answers) return { ok: false, unavailable: answers.unavailable };
  return {
    ok: true,
    answers: answers.taken,
    model: "file",
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

async function bodyMessage(response: Response): Promise<string> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return "";
  }
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
    const message = parsed.error?.message ?? parsed.message;
    if (typeof message === "string" && message) return message;
  } catch {
    // not JSON: the text itself
  }
  return text;
}

/**
 * One request to Jev (decision 8): never throws. A 429 or a 529 is retried after 1 s then 2 s,
 * then unavailable; a 401 is unauthorised; another status names itself and the body's message;
 * a timeout and a network error name themselves; every reason is redacted; the key travels in
 * the header alone, and only to an endpoint `endpointRefusal` allows.
 */
export async function askJev(
  cfg: JevConfig,
  request: JevRequest,
  options: AskOptions = {},
): Promise<JevResult> {
  if (cfg.refused) return { ok: false, unavailable: `endpoint refused: ${cfg.refused}` };
  if (cfg.canned !== null) return canned(cfg, request);
  if (cfg.key === null) return { ok: false, unavailable: `no key (${JEV_KEY_VARIABLE})` };
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const body = JSON.stringify({
    state: request.state,
    model: cfg.model,
    questions: request.questions,
  });
  const fail = (reason: string): JevResult => ({ ok: false, unavailable: redact(reason, cfg) });
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await doFetch(cfg.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError")
        return fail(`timeout after ${timeoutMs} ms`);
      return fail(`network error: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status === 429 || response.status === 529) {
      const wait = RETRY_MS[attempt];
      if (wait !== undefined) {
        await sleep(wait);
        continue;
      }
      return fail(response.status === 429 ? "rate limited (429)" : "overloaded (529)");
    }
    if (response.status === 401) return fail("unauthorised (401)");
    if (response.status < 200 || response.status >= 300)
      return fail(`${response.status}: ${await bodyMessage(response)}`);
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return fail("malformed answer");
    }
    const payload = (typeof parsed === "object" && parsed !== null ? parsed : {}) as {
      answers?: unknown;
      model?: unknown;
      usage?: { input_tokens?: unknown; output_tokens?: unknown };
    };
    const answers = takeAnswers(payload.answers, request.questions, "api");
    if ("unavailable" in answers) return fail(answers.unavailable);
    return {
      ok: true,
      answers: answers.taken,
      model: typeof payload.model === "string" ? payload.model : cfg.model,
      usage: {
        input_tokens:
          typeof payload.usage?.input_tokens === "number" ? payload.usage.input_tokens : 0,
        output_tokens:
          typeof payload.usage?.output_tokens === "number" ? payload.usage.output_tokens : 0,
      },
    };
  }
}

export type MarkStatus = "verified" | "disputed" | "unverified";

export interface Mark {
  status: MarkStatus;
  confidence: number | null;
  reason?: string;
}

/** Four decimals: the threshold's complement reads as written (`1 - 0.8` is 0.2, not 0.19999…). */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Two decimals, as every confidence and probability is printed. */
export function two(n: number): string {
  return n.toFixed(2);
}

/**
 * What an answer is worth (decision 11): a noul at or above the threshold is yes, at or below one
 * minus the threshold is no, between is unverified; a choice counts when its confidence reaches
 * the threshold and is verified on the supporting option, disputed on the contradicting one; a
 * score is a proposal, never a mark.
 */
export function markOf(
  answer: JevAnswer,
  threshold: number,
  options: { supports?: string; contradicts?: string } = {},
): Mark {
  const limit = round4(threshold);
  if (answer.type === "noul") {
    const p = round4(answer.noul);
    if (p >= limit) return { status: "verified", confidence: answer.noul };
    if (p <= round4(1 - limit)) return { status: "disputed", confidence: round4(1 - answer.noul) };
    return { status: "unverified", confidence: answer.noul, reason: "between the thresholds" };
  }
  if (answer.type === "choice") {
    if (round4(answer.confidence) < limit)
      return {
        status: "unverified",
        confidence: answer.confidence,
        reason: `confidence ${two(answer.confidence)} under ${threshold}`,
      };
    if (answer.choice === (options.supports ?? "supports"))
      return { status: "verified", confidence: answer.confidence };
    if (answer.choice === (options.contradicts ?? "contradicts"))
      return { status: "disputed", confidence: answer.confidence };
    return { status: "unverified", confidence: answer.confidence, reason: answer.choice };
  }
  return { status: "unverified", confidence: answer.confidence, reason: "a score is a proposal" };
}

/** The level with the highest probability, the first on a tie: never the weighted score (the jaggedness notes). */
export function topLevel(
  answer: Extract<JevAnswer, { type: "score" }>,
  levels: readonly string[],
): { level: string; probability: number } {
  let best = { level: levels[0] ?? "", probability: -1 };
  for (const level of levels) {
    const p = answer.probabilities[level] ?? 0;
    if (p > best.probability) best = { level, probability: p };
  }
  return best;
}
