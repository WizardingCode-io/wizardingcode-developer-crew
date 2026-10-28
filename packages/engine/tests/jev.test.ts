import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/config.ts";
import {
  askJev,
  type JevAnswer,
  type JevRequest,
  jevConfig,
  markOf,
  redact,
  topLevel,
} from "../src/jev.ts";
import { tempDir, testEnv } from "./helpers.ts";

const REQUEST: JevRequest = {
  state: { findings: { d1: { file: "src/a.ts", line: 3, text: "x" } } },
  questions: { d1: { type: "noul", instructions: "Is `findings.d1` a defect?" } },
};
const KEY = "sk-live-SECRET-0001";

function fakeFetch(
  responses: (Response | Error)[],
  calls: { url: string; init: RequestInit }[] = [],
): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next ?? new Response("{}", { status: 500 });
  }) as typeof fetch;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const noSleep = async () => {};

test("SP3-T6 AC-1: jevConfig takes the key from the environment alone and the endpoint and the model from the environment, else the config, else the defaults; configured with a key or a file:// endpoint; an endpoint the key may not travel to is refused", () => {
  const env = { WIZARDINGCODE_JEV_API_KEY: KEY } as NodeJS.ProcessEnv;
  expect(jevConfig(env, DEFAULT_CONFIG)).toMatchObject({
    key: KEY,
    endpoint: "https://api.typesafe.ai/v1/systemone",
    model: "jev-latest",
    canned: null,
    configured: true,
    refused: null,
  });
  expect(jevConfig({} as NodeJS.ProcessEnv, DEFAULT_CONFIG)).toMatchObject({
    key: null,
    configured: false,
  });
  expect(
    jevConfig(
      {
        WIZARDINGCODE_JEV_ENDPOINT: "https://proxy.invalid/v1",
        WIZARDINGCODE_JEV_MODEL: "jev-1.13.0",
      } as NodeJS.ProcessEnv,
      {
        ...DEFAULT_CONFIG,
        jev: { endpoint: "https://config.invalid/v1", model: "jev-config" },
      },
    ),
  ).toMatchObject({ endpoint: "https://proxy.invalid/v1", model: "jev-1.13.0" });
  expect(
    jevConfig({} as NodeJS.ProcessEnv, {
      ...DEFAULT_CONFIG,
      jev: { endpoint: "file:///tmp/answers.json" },
    }),
  ).toMatchObject({
    canned: "/tmp/answers.json",
    configured: true,
  });
  for (const [endpoint, reason] of [
    ["https://u:p@api.invalid/v1", "an endpoint carries no userinfo"],
    ["http://api.invalid/v1", "the key travels over https (http only to a loopback host)"],
    ["ftp://x", "the key travels over https (http only to a loopback host)"],
    ["file://", "file:// needs a path"],
  ] as const) {
    const cfg = jevConfig(
      { WIZARDINGCODE_JEV_API_KEY: KEY, WIZARDINGCODE_JEV_ENDPOINT: endpoint } as NodeJS.ProcessEnv,
      DEFAULT_CONFIG,
    );
    expect(cfg.refused).toBe(reason);
    expect(cfg.canned).toBeNull();
  }
  expect(
    jevConfig(
      {
        WIZARDINGCODE_JEV_API_KEY: KEY,
        WIZARDINGCODE_JEV_ENDPOINT: "http://127.0.0.1:1/v1",
      } as NodeJS.ProcessEnv,
      DEFAULT_CONFIG,
    ).refused,
  ).toBeNull();
});

test("SP3-T6 AC-1, AC-3: askJev sends the request as the API takes it, parses a 200, retries a 429 and a 529 twice, and names every failure without ever naming the key", async () => {
  const env = { WIZARDINGCODE_JEV_API_KEY: KEY } as NodeJS.ProcessEnv;
  const cfg = jevConfig(env, DEFAULT_CONFIG);
  const calls: { url: string; init: RequestInit }[] = [];
  const answers = { d1: { type: "noul", noul: 0.93 } };
  const ok = await askJev(cfg, REQUEST, {
    fetch: fakeFetch(
      [json(200, { model: "jev-1.13.0", answers, usage: { input_tokens: 12, output_tokens: 3 } })],
      calls,
    ),
    sleep: noSleep,
  });
  expect(ok as unknown).toEqual({
    ok: true,
    answers,
    model: "jev-1.13.0",
    usage: { input_tokens: 12, output_tokens: 3 },
  });
  expect(calls[0]?.url).toBe("https://api.typesafe.ai/v1/systemone");
  expect(calls[0]?.init.method).toBe("POST");
  expect(calls[0]?.init.headers).toEqual({
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  });
  expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
    state: REQUEST.state,
    model: "jev-latest",
    questions: REQUEST.questions,
  });
  // A 429 then a 200 after the backoff; three 429s unavailable; a 529 likewise.
  const slept: number[] = [];
  const sleep = async (ms: number) => {
    slept.push(ms);
  };
  expect(
    (
      await askJev(cfg, REQUEST, {
        fetch: fakeFetch([json(429, {}), json(200, { answers })]),
        sleep,
      })
    ).ok,
  ).toBe(true);
  expect(slept).toEqual([1000]);
  expect(
    await askJev(cfg, REQUEST, {
      fetch: fakeFetch([json(429, {}), json(429, {}), json(429, {})]),
      sleep,
    }),
  ).toEqual({ ok: false, unavailable: "rate limited (429)" });
  expect(slept).toEqual([1000, 1000, 2000]);
  expect(
    await askJev(cfg, REQUEST, {
      fetch: fakeFetch([json(529, {}), json(529, {}), json(529, {})]),
      sleep: noSleep,
    }),
  ).toEqual({ ok: false, unavailable: "overloaded (529)" });
  expect(await askJev(cfg, REQUEST, { fetch: fakeFetch([json(401, {})]) })).toEqual({
    ok: false,
    unavailable: "unauthorised (401)",
  });
  expect(
    await askJev(cfg, REQUEST, {
      fetch: fakeFetch([
        json(422, { error: { message: "questions: d1.instructions is required" } }),
      ]),
    }),
  ).toEqual({
    ok: false,
    unavailable: "422: questions: d1.instructions is required",
  });
  // A body that echoes the key never reaches the record.
  const echoed = await askJev(cfg, REQUEST, {
    fetch: fakeFetch([
      json(400, { message: `bad key ${KEY} for https://api.typesafe.ai/v1/systemone` }),
    ]),
  });
  expect(echoed).toEqual({
    ok: false,
    unavailable: "400: bad key [key] for https://api.typesafe.ai/v1/systemone",
  });
  const timeout = Object.assign(new Error("The operation was aborted due to timeout"), {
    name: "TimeoutError",
  });
  expect(await askJev(cfg, REQUEST, { fetch: fakeFetch([timeout]), timeoutMs: 50 })).toEqual({
    ok: false,
    unavailable: "timeout after 50 ms",
  });
  expect(
    await askJev(cfg, REQUEST, { fetch: fakeFetch([new Error("connect ECONNREFUSED")]) }),
  ).toEqual({ ok: false, unavailable: "network error: connect ECONNREFUSED" });
  expect(await askJev(cfg, REQUEST, { fetch: fakeFetch([json(200, { model: "x" })]) })).toEqual({
    ok: false,
    unavailable: "malformed answer",
  });
  expect(
    await askJev(cfg, REQUEST, {
      fetch: fakeFetch([json(200, { answers: { d1: { type: "choice", choice: "x" } } })]),
    }),
  ).toEqual({ ok: false, unavailable: "malformed answer" });
  // An endpoint the key may not travel to: nothing fetched.
  const refusedCalls: { url: string; init: RequestInit }[] = [];
  const bad = jevConfig(
    {
      WIZARDINGCODE_JEV_API_KEY: KEY,
      WIZARDINGCODE_JEV_ENDPOINT: "https://u:p@api.invalid/v1",
    } as NodeJS.ProcessEnv,
    DEFAULT_CONFIG,
  );
  expect(
    await askJev(bad, REQUEST, { fetch: fakeFetch([json(200, { answers })], refusedCalls) }),
  ).toEqual({ ok: false, unavailable: "endpoint refused: an endpoint carries no userinfo" });
  expect(refusedCalls).toEqual([]);
  expect(
    await askJev(jevConfig({} as NodeJS.ProcessEnv, DEFAULT_CONFIG), REQUEST, {
      fetch: fakeFetch([]),
    }),
  ).toEqual({ ok: false, unavailable: "no key (WIZARDINGCODE_JEV_API_KEY)" });
  expect(
    redact(`token ${KEY} at https://u:p@x.invalid/v1?k=${KEY}\nline two`, {
      key: KEY,
      endpoint: `https://u:p@x.invalid/v1?k=${KEY}`,
    }),
  ).toBe("token [key] at https://x.invalid/v1 line two");
});

test("SP3-T6 AC-1: the canned transport answers from a file as the API would, names a missing id, a wrong type and an unreadable file", async () => {
  const dir = tempDir("crew-jev-");
  const file = join(dir, "answers.json");
  writeFileSync(file, JSON.stringify({ d1: { type: "noul", noul: 0.12 } }));
  const cfg = jevConfig(
    { WIZARDINGCODE_JEV_ENDPOINT: `file://${file}` } as NodeJS.ProcessEnv,
    DEFAULT_CONFIG,
  );
  expect(cfg).toMatchObject({ canned: file, configured: true, key: null });
  expect(await askJev(cfg, REQUEST)).toEqual({
    ok: true,
    answers: { d1: { type: "noul", noul: 0.12 } },
    model: "file",
    usage: { input_tokens: 0, output_tokens: 0 },
  });
  expect(
    await askJev(cfg, { ...REQUEST, questions: { d2: REQUEST.questions.d1 as never } }),
  ).toEqual({ ok: false, unavailable: "no canned answer for d2" });
  writeFileSync(
    file,
    JSON.stringify({
      d1: { type: "choice", choice: "supports", probabilities: { supports: 1 }, confidence: 1 },
    }),
  );
  expect(await askJev(cfg, REQUEST)).toEqual({
    ok: false,
    unavailable: "canned answer for d1 is not a noul",
  });
  writeFileSync(file, "{not json");
  expect(await askJev(cfg, REQUEST)).toEqual({
    ok: false,
    unavailable: `canned answers unreadable: ${file}`,
  });
});

test("SP3-T6 AC-2: markOf on the thresholds' edges, compared on four decimals; a score is a proposal; topLevel takes the highest probability, never the weighted score", () => {
  const noul = (p: number): JevAnswer => ({ type: "noul", noul: p });
  expect(markOf(noul(0.8), 0.8)).toEqual({ status: "verified", confidence: 0.8 });
  expect(markOf(noul(0.2), 0.8)).toEqual({ status: "disputed", confidence: 0.8 });
  expect(markOf(noul(0.79), 0.8)).toEqual({
    status: "unverified",
    confidence: 0.79,
    reason: "between the thresholds",
  });
  expect(markOf(noul(0.21), 0.8)).toEqual({
    status: "unverified",
    confidence: 0.21,
    reason: "between the thresholds",
  });
  expect(markOf(noul(0.03), 0.8)).toEqual({ status: "disputed", confidence: 0.97 });
  const choice = (c: string, confidence: number): JevAnswer => ({
    type: "choice",
    choice: c,
    probabilities: { [c]: confidence },
    confidence,
  });
  expect(markOf(choice("supports", 0.8), 0.8)).toEqual({ status: "verified", confidence: 0.8 });
  expect(markOf(choice("contradicts", 0.95), 0.8)).toEqual({
    status: "disputed",
    confidence: 0.95,
  });
  expect(markOf(choice("says_nothing", 0.9), 0.8)).toEqual({
    status: "unverified",
    confidence: 0.9,
    reason: "says_nothing",
  });
  expect(markOf(choice("supports", 0.79), 0.8)).toEqual({
    status: "unverified",
    confidence: 0.79,
    reason: "confidence 0.79 under 0.8",
  });
  expect(markOf(choice("yes", 0.9), 0.8, { supports: "yes", contradicts: "no" })).toEqual({
    status: "verified",
    confidence: 0.9,
  });
  const score: JevAnswer = {
    type: "score",
    score: 1.6,
    legend: { "1": "normal", "2": "high" },
    probabilities: { normal: 0.45, high: 0.55 },
    confidence: 0.6,
  };
  expect(markOf(score, 0.8)).toEqual({
    status: "unverified",
    confidence: 0.6,
    reason: "a score is a proposal",
  });
  expect(topLevel(score, ["low", "normal", "high", "blocker"])).toEqual({
    level: "high",
    probability: 0.55,
  });
  expect(
    topLevel({ ...score, probabilities: { normal: 0.5, high: 0.5 } }, [
      "low",
      "normal",
      "high",
      "blocker",
    ]),
  ).toEqual({ level: "normal", probability: 0.5 });
});

test("SP9-T11 AC-11 (finding 193): testEnv() hands the engine no Jev variable of the developer's environment, whatever process.env holds, so no test reaches the real service unless it sets its own", () => {
  const names = [
    "WIZARDINGCODE_JEV_API_KEY",
    "WIZARDINGCODE_JEV_ENDPOINT",
    "WIZARDINGCODE_JEV_MODEL",
  ] as const;
  const saved = names.map((n) => [n, process.env[n]] as const);
  process.env.WIZARDINGCODE_JEV_API_KEY = KEY;
  process.env.WIZARDINGCODE_JEV_ENDPOINT = "https://jev.invalid/v1";
  process.env.WIZARDINGCODE_JEV_MODEL = "jev-test";
  try {
    const env = testEnv();
    for (const n of names) expect(env[n], n).toBeUndefined();
    expect(env.WIZARDINGCODE_HOME).toBeDefined();
    expect(env.WIZARDINGCODE_CREW_CLAUDE).toBeDefined();
    expect(jevConfig(env, DEFAULT_CONFIG).configured).toBe(false);
  } finally {
    for (const [n, v] of saved) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
  }
});
