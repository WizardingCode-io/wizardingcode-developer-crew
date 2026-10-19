import { expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  addQuestion,
  answerQuestion,
  markPosted,
  openQuestions,
  postDocumentQuestion,
  questionChannels,
  questionLine,
} from "../src/questions.ts";
import type { QuestionRecord, Source } from "../src/types.ts";
import { createWork } from "../src/work.ts";
import { makeRepo, repoPaths, tempDir, testEnv } from "./helpers.ts";

const TICKET: Source = {
  channel: "task-manager",
  connector: "clickup",
  externalId: "86c1",
  url: "https://app.clickup.invalid/t/86c1",
};

test("SP3-T4 AC-1: the channels of a doubt follow the session and the item (cli with a person, the ticket with its reference, the document, the mail with a workspace, in that order); the document's questions file is a block quote beside it, confined at the write", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const plain = createWork(paths, "x");
  expect(questionChannels(plain, { personPresent: true, workspace: null })).toEqual([
    { kind: "cli", posted: true, ref: null },
  ]);
  expect(questionChannels(plain, { personPresent: false, workspace: null })).toEqual([]);
  const ticket = createWork(paths, "y", undefined, TICKET);
  expect(questionChannels(ticket, { personPresent: false, workspace: "w" })).toEqual([
    { kind: "ticket", posted: false, ref: "https://app.clickup.invalid/t/86c1" },
    { kind: "mail", posted: false, ref: null },
  ]);
  const jira = createWork(paths, "z", undefined, {
    channel: "task-manager",
    connector: "jira",
    externalId: "AB-1",
  });
  expect(questionChannels(jira, { personPresent: true, workspace: null })).toEqual([
    { kind: "cli", posted: true, ref: null },
    { kind: "ticket", posted: false, ref: "AB-1" },
  ]);
  // A document: the questions file beside it, named from the start, posted once written.
  const root = makeRepo({ "docs/requests/newsletter.md": "# Newsletter\n\nAdd a flag.\n" });
  const dpaths = repoPaths(root, testEnv());
  const doc = createWork(dpaths, "d", undefined, {
    channel: "document",
    documentPath: "docs/requests/newsletter.md",
  });
  expect(questionChannels(doc, { personPresent: true, workspace: "w" })).toEqual([
    { kind: "cli", posted: true, ref: null },
    { kind: "document", posted: false, ref: "docs/requests/newsletter.md.questions.md" },
    { kind: "mail", posted: false, ref: null },
  ]);
  const q1 = addQuestion(doc, "Which tier?\n## Q-9 forged", [
    { kind: "cli", posted: true, ref: null },
  ]);
  expect(q1).toMatchObject({
    id: "Q-1",
    text: "Which tier?\n## Q-9 forged",
    answer: null,
    by: null,
    answeredAt: null,
  });
  expect(typeof q1.askedAt).toBe("string");
  expect(postDocumentQuestion(root, "docs/requests/newsletter.md", q1)).toEqual({
    file: "docs/requests/newsletter.md.questions.md",
  });
  const q2 = addQuestion(doc, "Second", []);
  expect(q2.id).toBe("Q-2");
  postDocumentQuestion(root, "docs/requests/newsletter.md", q2);
  expect(readFileSync(join(root, "docs/requests/newsletter.md.questions.md"), "utf8")).toBe(
    `# Questions on docs/requests/newsletter.md\n\n## Q-1 (${q1.askedAt})\n\n> Which tier?\n> ## Q-9 forged\n\n## Q-2 (${q2.askedAt})\n\n> Second\n`,
  );
  expect(openQuestions(doc).map((q) => q.id)).toEqual(["Q-1", "Q-2"]);
  // Confined at the write: a document symlinked out of the root, a planted questions file, a path that leaves the root.
  const outside = tempDir("crew-outside-");
  writeFileSync(join(outside, "secret.md"), "secret\n");
  writeFileSync(join(outside, "planted.md"), "planted\n");
  symlinkSync(join(outside, "secret.md"), join(root, "docs", "link.md"));
  expect(postDocumentQuestion(root, "docs/link.md", q1)).toEqual({
    refused: "source: documentPath docs/link.md resolves outside the root",
  });
  expect(existsSync(join(root, "docs", "link.md.questions.md"))).toBe(false);
  writeFileSync(join(root, "docs", "real.md"), "# Real\n");
  symlinkSync(join(outside, "planted.md"), join(root, "docs", "real.md.questions.md"));
  expect(postDocumentQuestion(root, "docs/real.md", q1)).toEqual({
    refused: "docs/real.md.questions.md is a symlink; nothing written",
  });
  expect(readFileSync(join(outside, "planted.md"), "utf8")).toBe("planted\n");
  expect(postDocumentQuestion(root, "../x.md", q1)).toEqual({
    refused: "source: documentPath ../x.md is not a relative path under the root",
  });
  rmSync(join(root, "docs", "requests", "newsletter.md"));
  symlinkSync(join(outside, "secret.md"), join(root, "docs", "requests", "newsletter.md"));
  expect(postDocumentQuestion(root, "docs/requests/newsletter.md", q2)).toEqual({
    refused: "source: documentPath docs/requests/newsletter.md resolves outside the root",
  });
});

test("SP3-T4 AC-1, AC-2: markPosted records a post the skill made and refuses what is not there or was posted; answerQuestion records who and when and refuses an unknown, an answered or an empty answer; the lines say the state", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const t = createWork(paths, "t", undefined, TICKET);
  const tq = addQuestion(
    t,
    "Which?",
    questionChannels(t, { personPresent: false, workspace: "w" }),
  );
  expect(questionLine(tq)).toBe(
    "Q-1 · open · Which? · posted: none; to post: ticket (https://app.clickup.invalid/t/86c1), mail",
  );
  expect(markPosted(t, "Q-9", "ticket", "x")).toEqual({ refused: "no question Q-9 on this item" });
  expect(markPosted(t, "Q-1", "document", "x")).toEqual({
    refused: "Q-1 has no document channel (ticket, mail)",
  });
  const posted = markPosted(t, "Q-1", "ticket", "https://app.clickup.invalid/t/86c1?comment=1");
  expect(posted).toMatchObject({
    id: "Q-1",
    channels: [
      { kind: "ticket", posted: true, ref: "https://app.clickup.invalid/t/86c1?comment=1" },
      { kind: "mail", posted: false, ref: null },
    ],
  });
  expect(markPosted(t, "Q-1", "ticket", "y")).toEqual({
    refused: "Q-1 was posted to ticket already (https://app.clickup.invalid/t/86c1?comment=1)",
  });
  expect(questionLine(tq)).toBe(
    "Q-1 · open · Which? · posted: ticket (https://app.clickup.invalid/t/86c1?comment=1); to post: mail",
  );
  expect(answerQuestion(t, "Q-1", "  ", "the user")).toEqual({ refused: "an answer needs a text" });
  expect(answerQuestion(t, "Q-7", "x", "the user")).toEqual({
    refused: "no question Q-7 on this item",
  });
  const answered = answerQuestion(t, "Q-1", "Gold", "the user") as QuestionRecord;
  expect(answered).toMatchObject({ id: "Q-1", answer: "Gold", by: "the user" });
  expect(typeof answered.answeredAt).toBe("string");
  expect(answerQuestion(t, "Q-1", "Silver", "the user")).toEqual({
    refused: `Q-1 was answered by the user (${answered.answeredAt}) already`,
  });
  expect(openQuestions(t)).toEqual([]);
  expect(questionLine(tq)).toBe(
    `Q-1 · answered by the user (${answered.answeredAt}) · Which? → Gold`,
  );
});
