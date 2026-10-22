import { expect, test } from "bun:test";
import { oneLine } from "../src/state.ts";

/** The bidirectional and invisible format characters oneLine deletes (finding 58, the security lead's return). */
const FORMAT = [
  ...[0x200b, 0x200c, 0x200d, 0x200e, 0x200f],
  ...[0x202a, 0x202b, 0x202c, 0x202d, 0x202e],
  0x2060,
  ...[0x2066, 0x2067, 0x2068, 0x2069],
  0xfeff,
];

test("CON5-AC-7-oneline: oneLine deletes each bidirectional and invisible format character, not spaces it, beside what it cleans today", () => {
  for (const code of FORMAT) {
    const ch = String.fromCharCode(code);
    expect(oneLine(`ab${ch}cd`), `U+${code.toString(16)}`).toBe("abcd");
    expect(oneLine(`${ch}ab ${ch}cd${ch}`), `U+${code.toString(16)}`).toBe("ab cd");
  }
  expect(oneLine("a‮​﻿b")).toBe("ab");
  // What it removes today stays removed: an escape sequence, and C0, DEL and C1 as one space.
  expect(oneLine("a\x1b[31mb")).toBe("ab");
  expect(oneLine("a\x00b\x7fc\x85d")).toBe("a b c d");
});
