import { expect, test } from "bun:test";
import { gradeConsole, gradeLogs } from "../src/console.ts";
import { tempDir, write } from "./helpers.ts";

test("SP7b-T4 AC-3: the console file is graded as data: the first entry at error or warning fails, warn is warning, what is not an entry is ignored, no file is none, a file that does not parse is invalid", () => {
  const array = tempDir();
  write(
    array,
    "console.json",
    '[{"page":"/home","type":"log","text":"ok"},{"page":"/home","type":"warning","text":"deprecated"}]',
  );
  expect(gradeConsole(array)).toMatchObject({
    status: "failed",
    first: { page: "/home", type: "warning", text: "deprecated" },
  });
  const lines = tempDir();
  write(
    lines,
    "console.jsonl",
    '{"type":"log","text":"ok","page":"/home"}\n{"type":"error","text":"boom","page":"/cart"}\n',
  );
  expect(gradeConsole(lines)).toMatchObject({
    status: "failed",
    first: { page: "/cart", type: "error", text: "boom" },
  });
  const clean = tempDir();
  write(clean, "console.json", "[]");
  expect(gradeConsole(clean).status).toBe("clean");
  const warn = tempDir();
  write(warn, "console.json", '[{"type":"log"},{"type":"info"},{"type":"warn"}]');
  expect(gradeConsole(warn)).toMatchObject({ status: "failed", first: { type: "warning" } });
  const junk = tempDir();
  write(junk, "console.json", '[{"page":"/x"},"text",{"type":5}]');
  expect(gradeConsole(junk).status).toBe("clean");
  expect(gradeConsole(tempDir()).status).toBe("none");
  const broken = tempDir();
  write(broken, "console.json", "{nope");
  expect(gradeConsole(broken).status).toBe("invalid");
});

test("SP7b-T4 AC-3: the logs are graded line by line: a line at error or warning after an optional timestamp, a JSON level or a level= pair fails naming the first; errors handled: 0 is clean", () => {
  expect(gradeLogs("INFO ok\n2026-10-18 10:00:00 ERROR boom\nwarning: later\n")).toEqual({
    status: "failed",
    first: "2026-10-18 10:00:00 ERROR boom",
  });
  expect(gradeLogs("[2026-10-18T10:00:00Z] ERROR x\n").status).toBe("failed");
  expect(gradeLogs("[ERROR] x\n").status).toBe("failed");
  expect(gradeLogs('{"level":"warn","msg":"x"}\n').status).toBe("failed");
  expect(gradeLogs("ts=1 level=error msg=x\n").status).toBe("failed");
  expect(gradeLogs("INFO all good\nerrors handled: 0\nwarnings: none\n")).toEqual({
    status: "clean",
  });
  expect(gradeLogs("Terror strikes at noon\n")).toEqual({ status: "clean" });
  expect(gradeLogs("")).toEqual({ status: "clean" });
});
