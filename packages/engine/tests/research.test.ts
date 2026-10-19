import { expect, test } from "bun:test";
import { fetchSource, findQuote, parseFacts, urlRefusal } from "../src/research.ts";
import { git, makeRepo, write } from "./helpers.ts";

test("SP3-T6 AC-1: parseFacts reads the researcher's lines with straight or curly quotes and skips a line that does not parse; findQuote matches across a line wrap, curly quotes and a dash", () => {
  const text = [
    "# Research",
    "## What the code has",
    "- src/a.ts:3 · the flag is read once",
    "## What the documentation says",
    '- https://docs.invalid/flags · "A flag is read at start-up" · D-1 needs no reload',
    "- docs/notes.md · \u201cthe cache lives one hour\u201d · D-2 bounds the window",
    "- a line without the separators",
    "## What the facts do not settle",
    "- D-3 · x",
  ].join("\n");
  expect(parseFacts(text)).toEqual([
    {
      id: "F-1",
      source: "https://docs.invalid/flags",
      quote: "A flag is read at start-up",
      claim: "D-1 needs no reload",
    },
    {
      id: "F-2",
      source: "docs/notes.md",
      quote: "the cache lives one hour",
      claim: "D-2 bounds the window",
    },
  ]);
  expect(parseFacts("# nothing\n")).toEqual([]);
  const page =
    "Intro.\nA flag is read\n  at start\u2011up, and \u201cthe cache lives one hour\u201d \u2014 said the page.";
  expect(findQuote("A flag is read at start-up", page)?.excerpt).toContain(
    "A flag is read at start-up",
  );
  expect(findQuote('"the cache lives one hour" - said', page)).not.toBeNull();
  expect(findQuote("not there", page)).toBeNull();
  expect(findQuote("", page)).toBeNull();
  const long = `${"a ".repeat(400)}needle${" b".repeat(400)}`;
  expect(findQuote("needle", long)?.excerpt.length).toBe(606);
});

test("SP3-T6 AC-1: fetchSource reads a tracked path under the root and refuses .., an untracked file and .env; fetches an http(s) URL with a text type and a 2 MiB cut, refuses a non-text type, a userinfo URL and a redirect to a metadata host", async () => {
  const root = makeRepo({ "docs/notes.md": "the cache lives one hour\n" });
  write(root, ".env", "SECRET=1\n");
  write(root, "docs/untracked.md", "x\n");
  git(root, "add", "docs/notes.md");
  expect(await fetchSource("docs/notes.md", root)).toEqual({ text: "the cache lives one hour\n" });
  expect(await fetchSource("../x.md", root)).toEqual({ refused: "../x.md: not a tracked file" });
  expect(await fetchSource("docs/untracked.md", root)).toEqual({
    refused: "docs/untracked.md: not a tracked file",
  });
  expect(await fetchSource(".env", root)).toEqual({ refused: ".env: not a tracked file" });
  const calls: string[] = [];
  const fake = (routes: Record<string, () => Response>): typeof fetch =>
    (async (url: string | URL | Request) => {
      calls.push(String(url));
      const make = routes[String(url)];
      return make ? make() : new Response("missing", { status: 404 });
    }) as typeof fetch;
  const text =
    (body: string, type = "text/html; charset=utf-8") =>
    () =>
      new Response(body, { status: 200, headers: { "content-type": type } });
  expect(
    await fetchSource("https://docs.invalid/flags", root, {
      fetch: fake({ "https://docs.invalid/flags": text("<p>A flag</p>") }),
    }),
  ).toEqual({ text: "<p>A flag</p>" });
  expect(
    await fetchSource("https://docs.invalid/bin", root, {
      fetch: fake({ "https://docs.invalid/bin": text("x", "application/octet-stream") }),
    }),
  ).toEqual({ refused: "https://docs.invalid/bin: not a text source (application/octet-stream)" });
  expect(await fetchSource("https://docs.invalid/missing", root, { fetch: fake({}) })).toEqual({
    refused: "https://docs.invalid/missing: 404",
  });
  const big = await fetchSource("https://docs.invalid/big", root, {
    fetch: fake({ "https://docs.invalid/big": text("x".repeat(3000)) }),
    maxBytes: 2048,
  });
  expect("text" in big && big.text.length).toBe(2048);
  expect(await fetchSource("https://u:p@docs.invalid/x", root, { fetch: fake({}) })).toEqual({
    refused: "https://u:p@docs.invalid/x: userinfo",
  });
  const hop = () =>
    new Response("", {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data/" },
    });
  expect(
    await fetchSource("https://docs.invalid/go", root, {
      fetch: fake({ "https://docs.invalid/go": hop }),
    }),
  ).toEqual({ refused: "https://docs.invalid/go: refused host 169.254.169.254" });
  expect(calls).not.toContain("http://169.254.169.254/latest/meta-data/");
  expect(
    await fetchSource("https://docs.invalid/moved", root, {
      fetch: fake({
        "https://docs.invalid/moved": () =>
          new Response("", { status: 301, headers: { location: "/here" } }),
        "https://docs.invalid/here": text("here"),
      }),
    }),
  ).toEqual({ text: "here" });
  expect(urlRefusal("http://metadata.google.internal/x")).toBe(
    "refused host metadata.google.internal",
  );
  // The same addresses in another spelling (security review of the delivery): mapped, link-local v6, a trailing dot.
  expect(urlRefusal("http://[::ffff:169.254.169.254]/latest/")).toBe(
    "refused host ::ffff:a9fe:a9fe",
  );
  expect(urlRefusal("http://[fe80::1]/x")).toBe("refused host fe80::1");
  expect(urlRefusal("http://metadata.google.internal./x")).toBe(
    "refused host metadata.google.internal",
  );
  expect(urlRefusal("http://[fd00:ec2::254]/x")).toBe("refused host fd00:ec2::254");
  const mappedHop = () =>
    new Response("", {
      status: 302,
      headers: { location: "http://[::ffff:169.254.169.254]/latest/" },
    });
  expect(
    await fetchSource("https://docs.invalid/hop", root, {
      fetch: fake({ "https://docs.invalid/hop": mappedHop }),
    }),
  ).toEqual({ refused: "https://docs.invalid/hop: refused host ::ffff:a9fe:a9fe" });
  expect(urlRefusal("http://localhost:8080/wiki")).toBeNull();
  expect(urlRefusal("ftp://x")).toBe("not http(s)");
});
