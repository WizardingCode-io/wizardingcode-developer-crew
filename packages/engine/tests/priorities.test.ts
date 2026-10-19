import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  acceptPriorities,
  prioritiesDir,
  prioritiesState,
  triagePriority,
} from "../src/priorities.ts";
import { tempDir, write } from "./helpers.ts";

test("SP3-T3 AC-2: the priorities file's four states, the signature by hash, the acceptance with and without --file, and a malformed signature read as changed", () => {
  const userDir = tempDir("crew-home-");
  const dir = prioritiesDir(userDir, "w");
  const file = join(dir, "priorities.md");
  expect(prioritiesState(userDir, "w")).toEqual({
    state: "none",
    path: file,
    text: null,
    signedAt: null,
  });
  write(userDir, "workspaces/w/priorities.md", "The checkout flow first.\n");
  expect(prioritiesState(userDir, "w")).toMatchObject({
    state: "unsigned",
    text: "The checkout flow first.\n",
    signedAt: null,
  });
  expect(acceptPriorities(userDir, "w", { by: "the user" })).toMatchObject({
    state: "signed",
    path: file,
  });
  const signed = prioritiesState(userDir, "w");
  expect(signed.state).toBe("signed");
  expect(typeof signed.signedAt).toBe("string");
  const signature = JSON.parse(readFileSync(join(dir, "priorities.json"), "utf8")) as {
    hash: string;
    by: string;
    at: string;
  };
  expect(signature).toMatchObject({ by: "the user" });
  expect(signature.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  // An edit after the signature is seen; a re-accept signs the new text, later.
  write(
    userDir,
    "workspaces/w/priorities.md",
    "The checkout flow first.\nThe loyalty launch on the 30th.\n",
  );
  expect(prioritiesState(userDir, "w").state).toBe("changed");
  expect(acceptPriorities(userDir, "w", { by: "the user" })).toMatchObject({
    state: "signed",
    path: file,
  });
  const second = JSON.parse(readFileSync(join(dir, "priorities.json"), "utf8")) as {
    hash: string;
    at: string;
  };
  expect(second.hash).not.toBe(signature.hash);
  expect(second.at >= signature.at).toBe(true);
  expect(prioritiesState(userDir, "w").state).toBe("signed");
  // --file copies the named file in and signs it, over a signed file too.
  const source = tempDir("crew-prio-");
  writeFileSync(join(source, "business.md"), "Cosmetic changes wait.\n");
  expect(
    acceptPriorities(userDir, "w", { file: join(source, "business.md"), by: "the user" }),
  ).toMatchObject({ state: "signed", path: file });
  expect(prioritiesState(userDir, "w")).toMatchObject({
    state: "signed",
    text: "Cosmetic changes wait.\n",
  });
  writeFileSync(join(source, "empty.md"), "   \n");
  expect(
    acceptPriorities(userDir, "w", { file: join(source, "empty.md"), by: "the user" }),
  ).toEqual({ refused: `${join(source, "empty.md")} is empty` });
  expect(
    acceptPriorities(userDir, "w", { file: join(source, "missing.md"), by: "the user" }),
  ).toEqual({ refused: `${join(source, "missing.md")} cannot be read` });
  writeFileSync(join(dir, "priorities.json"), "{ not json");
  expect(prioritiesState(userDir, "w").state).toBe("changed");
  writeFileSync(join(dir, "priorities.json"), JSON.stringify({ by: "x", at: "t" }));
  expect(prioritiesState(userDir, "w").state).toBe("changed");
  const other = tempDir("crew-home-");
  expect(acceptPriorities(other, "w", { by: "the user" })).toEqual({
    refused: `no priorities to sign: write ${join(prioritiesDir(other, "w"), "priorities.md")}, or crew workspace priorities accept --file <path>`,
  });
});

test("SP3-T3 AC-3: triagePriority confirms, lowers with a reason, never raises, and leaves the proposal unconfirmed without a signed file", () => {
  expect(triagePriority("high", undefined, undefined, "signed", "session")).toMatchObject({
    proposed: "high",
    confirmed: "high",
    by: "session",
    reason: null,
    against: "signed",
  });
  expect(triagePriority("high", "high", "  ", "signed", "session")).toMatchObject({
    confirmed: "high",
    reason: null,
  });
  expect(triagePriority("high", "high", "we agree", "signed", "session")).toMatchObject({
    confirmed: "high",
    reason: "we agree",
  });
  expect(
    triagePriority("high", "normal", "the release is frozen", "signed", "session"),
  ).toMatchObject({
    proposed: "high",
    confirmed: "normal",
    reason: "the release is frozen",
    against: "signed",
  });
  expect(triagePriority("high", "normal", undefined, "signed", "session")).toEqual({
    refused: 'a lowering needs --reason "<why>"',
  });
  expect(triagePriority("high", "normal", "   ", "signed", "session")).toEqual({
    refused: 'a lowering needs --reason "<why>"',
  });
  expect(triagePriority("high", "blocker", "x", "signed", "session")).toEqual({
    refused: "the source proposed high; the lead confirms or lowers, never raises",
  });
  for (const [state, against] of [
    ["unsigned", "unsigned"],
    ["changed", "unsigned"],
    ["none", "none"],
  ] as const) {
    expect(triagePriority("high", undefined, undefined, state, "session")).toMatchObject({
      proposed: "high",
      confirmed: null,
      against,
    });
    expect(triagePriority("high", "normal", "x", state, "session")).toEqual({
      refused:
        "the business priorities are not signed (crew workspace priorities accept [--file <path>]): the proposal stays unconfirmed",
    });
  }
});
