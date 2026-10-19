import { expect, test } from "bun:test";
import { rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseSource, sourceLine, sourceText } from "../src/source.ts";
import type { Source } from "../src/types.ts";
import { makeRepo, tempDir, write } from "./helpers.ts";

const ticket: Source = {
  channel: "task-manager",
  connector: "clickup",
  externalId: "86c1",
  url: "https://app.clickup.invalid/t/86c1",
  proposedPriority: "high",
};

test("SP3-T3 AC-1: parseSource accepts a task-manager source and a document source, refuses each bad shape naming the key, and confines a document by its real path at the parse and at the read", () => {
  const root = makeRepo({
    "docs/requests/newsletter.md": "# Newsletter\n\nAdd a newsletter flag.\n",
  });
  expect(parseSource(JSON.stringify(ticket), root)).toEqual(ticket);
  const doc: Source = { channel: "document", documentPath: "docs/requests/newsletter.md" };
  expect(parseSource(JSON.stringify(doc), root)).toEqual(doc);
  const refused = (raw: unknown): string => {
    const r = parseSource(typeof raw === "string" ? raw : JSON.stringify(raw), root);
    return "refused" in r ? r.refused : `accepted ${JSON.stringify(r)}`;
  };
  expect(refused("not json")).toBe("source: a JSON object");
  expect(refused([1])).toBe("source: a JSON object");
  expect(refused({ connector: "clickup" })).toBe("source: channel is document or task-manager");
  expect(refused({ channel: "task-manager", connector: "clickup" })).toBe(
    "source: a task manager needs connector and externalId",
  );
  expect(refused({ channel: "task-manager", connector: "trello", externalId: "1" })).toBe(
    "source: connector is clickup, jira, notion or other",
  );
  expect(refused({ ...ticket, url: "ftp://x" })).toBe("source: url is http or https");
  expect(refused({ ...ticket, proposedPriority: "urgent" })).toBe(
    "source: proposedPriority is one of blocker, high, normal, low",
  );
  expect(refused({ ...ticket, extra: 1 })).toBe("source: unknown key extra");
  expect(refused({ channel: "document" })).toBe("source: a document needs documentPath");
  expect(refused({ channel: "document", documentPath: "/etc/hosts" })).toBe(
    "source: documentPath /etc/hosts is not a relative path under the root",
  );
  expect(refused({ channel: "document", documentPath: "../x.md" })).toBe(
    "source: documentPath ../x.md is not a relative path under the root",
  );
  expect(refused({ channel: "document", documentPath: "docs/requests" })).toBe(
    "source: documentPath docs/requests is not a file under the root",
  );
  expect(refused({ channel: "document", documentPath: "docs/missing.md" })).toBe(
    "source: documentPath docs/missing.md is not a file under the root",
  );
  write(root, "docs/empty.md", "  \n");
  expect(refused({ channel: "document", documentPath: "docs/empty.md" })).toBe(
    "source: documentPath docs/empty.md is empty",
  );
  const outside = tempDir("crew-outside-");
  writeFileSync(join(outside, "secret.md"), "secret\n");
  symlinkSync(join(outside, "secret.md"), join(root, "docs", "link.md"));
  expect(refused({ channel: "document", documentPath: "docs/link.md" })).toBe(
    "source: documentPath docs/link.md resolves outside the root",
  );
  const parsed = parseSource(JSON.stringify(doc), root);
  if ("refused" in parsed) throw new Error(parsed.refused);
  expect(sourceText(parsed, root, "the request")).toBe("# Newsletter\n\nAdd a newsletter flag.\n");
  expect(sourceText(ticket, root, "the request")).toBe("the request");
  rmSync(join(root, "docs", "requests", "newsletter.md"));
  symlinkSync(join(outside, "secret.md"), join(root, "docs", "requests", "newsletter.md"));
  expect(sourceText(parsed, root, "x")).toEqual({
    refused: "source: documentPath docs/requests/newsletter.md resolves outside the root",
  });
  expect(sourceLine(ticket)).toBe("clickup 86c1 (https://app.clickup.invalid/t/86c1)");
  expect(sourceLine({ channel: "task-manager", connector: "jira", externalId: "AB-1" })).toBe(
    "jira AB-1",
  );
  expect(sourceLine(parsed)).toBe("document docs/requests/newsletter.md");
});
