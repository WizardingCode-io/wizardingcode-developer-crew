import { checkPath } from "./analysis.ts";
import { errorText, readText } from "./fs.ts";
import { confinedDocument } from "./source.ts";

/** One line of the researcher's `## What the documentation says`: the source, the quote, the claim it supports. */
export interface Fact {
  id: string;
  source: string;
  quote: string;
  claim: string;
}

const SECTION = /^##\s+What the documentation says\s*$/m;
const LINE = /^-\s+(.+?)\s+·\s+["“”](.+?)["“”]\s+·\s+(.+?)\s*$/;

/** The facts of a researcher file, `F-1` on; a line that does not parse is skipped. */
export function parseFacts(text: string): Fact[] {
  const start = SECTION.exec(text);
  if (!start) return [];
  const body = text.slice(start.index + start[0].length);
  const end = body.search(/^##\s/m);
  const section = end === -1 ? body : body.slice(0, end);
  const facts: Fact[] = [];
  for (const raw of section.split("\n")) {
    const m = LINE.exec(raw.trim());
    if (!m?.[1] || !m[2] || !m[3]) continue;
    facts.push({ id: `F-${facts.length + 1}`, source: m[1], quote: m[2], claim: m[3] });
  }
  return facts;
}

export interface FetchOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

const TEXT_TYPES = /^(?:text\/|application\/json|application\/xhtml\+xml)/i;
const MAX_HOPS = 3;

/**
 * A URL the engine may fetch for a role's text (security review of SP3 Task 6): http(s), no
 * userinfo, never a link-local or a cloud-metadata host. A loopback or private LAN host is
 * allowed (an internal wiki is a legitimate citation). Null when allowed, else the reason.
 */
export function urlRefusal(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "not a URL";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "not http(s)";
  if (url.username || url.password) return "userinfo";
  // The host as written, or in another spelling of the same address (security review, delivery
  // round 1): brackets and a trailing dot removed, an IPv4-mapped IPv6 form (`::ffff:a9fe:a9fe`
  // is 169.254.169.254) read through, the IPv6 link-local block (fe80::/10) refused as a whole.
  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  const mapped = host.startsWith("::ffff:") ? host.slice("::ffff:".length) : null;
  const linkLocalV4 = (h: string) => /^169\.254\./.test(h) || /^a9fe:/.test(h);
  if (
    host === "metadata.google.internal" ||
    host === "fd00:ec2::254" ||
    linkLocalV4(host) ||
    (mapped !== null && linkLocalV4(mapped)) ||
    /^fe[89ab][0-9a-f]:/.test(host)
  )
    return `refused host ${host}`;
  return null;
}

/**
 * The text of a source (decision 10): an http(s) URL fetched with no header of the user's, a
 * timeout, a byte cap, a text content type and the redirects followed by hand with every hop
 * checked; or a path under the root that git tracks, read as a request document is. The
 * researcher's text is a role's: nothing of the user travels with the request.
 */
export async function fetchSource(
  source: string,
  root: string,
  options: FetchOptions = {},
): Promise<{ text: string } | { refused: string }> {
  if (/^https?:\/\//i.test(source)) {
    const doFetch = options.fetch ?? fetch;
    const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
    let url = source;
    for (let hop = 0; ; hop++) {
      const bad = urlRefusal(url);
      if (bad) return { refused: `${source}: ${bad}` };
      let response: Response;
      try {
        response = await doFetch(url, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
        });
      } catch (error) {
        return { refused: `${source}: ${errorText(error)}` };
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || hop >= MAX_HOPS) return { refused: `${source}: ${response.status}` };
        try {
          url = new URL(location, url).toString();
        } catch {
          return { refused: `${source}: not a URL` };
        }
        continue;
      }
      if (response.status < 200 || response.status >= 300)
        return { refused: `${source}: ${response.status}` };
      const type = response.headers.get("content-type") ?? "";
      if (!TEXT_TYPES.test(type))
        return { refused: `${source}: not a text source (${type || "unknown"})` };
      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        return { refused: `${source}: ${errorText(error)}` };
      }
      return { text: text.length > maxBytes ? text.slice(0, maxBytes) : text };
    }
  }
  if (checkPath(root, source) !== null) return { refused: `${source}: not a tracked file` };
  const file = confinedDocument(root, source);
  if ("refused" in file) return { refused: `${source}: not a tracked file` };
  return { text: readText(file.file) ?? "" };
}

function normalise(text: string): string {
  return text
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const EXCERPT = 300;

/** Whether the source holds the quote (whitespace, quotes and dashes normalised), with the 600 characters around the first match. */
export function findQuote(quote: string, text: string): { excerpt: string } | null {
  const needle = normalise(quote);
  if (!needle) return null;
  const hay = normalise(text);
  const at = hay.indexOf(needle);
  if (at === -1) return null;
  const from = Math.max(0, at - EXCERPT);
  const to = Math.min(hay.length, at + needle.length + EXCERPT);
  return { excerpt: hay.slice(from, to) };
}
