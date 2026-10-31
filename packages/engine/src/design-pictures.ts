/**
 * The open archives a site's pictures can come from (item 2026-10-30-005, D-2): off until the user
 * sets `design.pictures`. Fixed HTTPS hosts, no redirect outside them, no private address, the query
 * encoded, each response capped in size and time and read as untrusted data, the licence taken from
 * the archive's structured field against an exact list. A download is saved under a name the engine makes.
 */
import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { lstatSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { designDir } from "./design.ts";
import { ensureDir } from "./fs.ts";
import type { CrewPaths } from "./paths.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";

export const API_HOSTS = new Set(["api.openverse.org", "commons.wikimedia.org"]);
export const FILE_HOSTS = new Set(["upload.wikimedia.org", "api.openverse.org"]);
const LICENCES = new Set([
  "cc0",
  "pdm",
  "by",
  "by-sa",
  "public domain",
  "cc-by-4.0",
  "cc-by-sa-4.0",
]);
export const RESPONSE_MAX = 2 * 1024 * 1024;
export const DOWNLOAD_MAX = 25 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const MAX_HOPS = 3;
// The archives refuse a request with no name (Wikimedia's policy; the Art Institute's image server answers 403).
const USER_AGENT = "wizardingcode-crew/1.0 (https://wizardingcode.io)";

export interface PictureResult {
  id: string;
  archive: string;
  title: string;
  creator: string;
  url: string;
  page: string;
  licence: string;
}

export interface FetchOptions {
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  lookup?: (host: string) => Promise<string>;
  maxBytes?: number;
  timeoutMs?: number;
  hosts?: ReadonlySet<string>;
}

function isPrivate(ip: string): boolean {
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivate(mapped[1] as string);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1] as string, 16);
    const low = Number.parseInt(mappedHex[2] as string, 16);
    return isPrivate(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if (v.includes(":")) return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  const p = v.split(".").map(Number);
  const [a = 0, b = 0] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** The body read as it arrives and stopped at the cap, so a response with no length cannot fill the memory. */
async function cappedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("pictures: over the size cap");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.length;
  }
  return body;
}

/** One response through the guard: https, an allowed host at every hop, a public address, capped in size and time. */
export async function guardedFetch(
  start: string,
  options: FetchOptions = {},
): Promise<{ body: Uint8Array; type: string }> {
  const fetchFn = options.fetchFn ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const lookup = options.lookup ?? (async (host: string) => (await dnsLookup(host)).address);
  const hosts = options.hosts ?? new Set([...API_HOSTS, ...FILE_HOSTS]);
  const maxBytes = options.maxBytes ?? RESPONSE_MAX;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  try {
    let url = start;
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error("pictures: https only");
      if (!hosts.has(parsed.hostname)) throw new Error("pictures: a host outside the allowlist");
      if (isPrivate(await lookup(parsed.hostname))) throw new Error("pictures: a private address");
      const response = await fetchFn(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "*/*" },
      });
      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get("location");
        if (!next) throw new Error("pictures: a redirect with no location");
        url = new URL(next, url).toString();
        continue;
      }
      if (!response.ok) throw new Error(`pictures: status ${response.status}`);
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > maxBytes) throw new Error("pictures: over the size cap");
      return {
        body: await cappedBody(response, maxBytes),
        type: response.headers.get("content-type") ?? "",
      };
    }
    throw new Error("pictures: too many redirects");
  } finally {
    clearTimeout(timer);
  }
}

/** A string from a response, as data: no control characters, no markup, one line, cut. */
export function cleanText(value: unknown, max = 200): string {
  const flat = String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ");
  return (
    flat
      // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is removed.
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
      .trim()
      .slice(0, max)
  );
}

const licenceOf = (raw: unknown): string | null => {
  const licence = String(raw ?? "")
    .trim()
    .toLowerCase();
  return LICENCES.has(licence) ? licence : null;
};
const safeUrl = (raw: unknown): string | null => {
  try {
    const url = new URL(String(raw));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

type Parse = (body: unknown) => PictureResult[];
const ADAPTERS: Record<string, { url: (q: string) => string; parse: Parse }> = {
  openverse: {
    url: (q) =>
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license_type=commercial&page_size=10`,
    parse: (body) =>
      ((body as { results?: Record<string, unknown>[] }).results ?? []).flatMap((r) => {
        const licence = licenceOf(r.license);
        const url = safeUrl(r.url);
        const page = safeUrl(r.foreign_landing_url);
        return licence && url && page
          ? [
              {
                id: cleanText(r.id, 80),
                archive: "openverse",
                title: cleanText(r.title),
                creator: cleanText(r.creator),
                url,
                page,
                licence,
              },
            ]
          : [];
      }),
  },
  wikimedia: {
    url: (q) =>
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1600`,
    parse: (body) =>
      Object.values(
        (body as { query?: { pages?: Record<string, Record<string, unknown>> } }).query?.pages ??
          {},
      ).flatMap((p) => {
        const info = (p.imageinfo as Record<string, unknown>[] | undefined)?.[0] ?? {};
        const meta = (info.extmetadata ?? {}) as Record<string, { value?: unknown }>;
        const licence = licenceOf(meta.License?.value);
        const url = safeUrl(info.thumburl ?? info.url);
        const page = safeUrl(info.descriptionurl);
        return licence && url && page
          ? [
              {
                id: cleanText(p.pageid, 80),
                archive: "wikimedia",
                title: cleanText(p.title),
                creator: cleanText(meta.Artist?.value),
                url,
                page,
                licence,
              },
            ]
          : [];
      }),
  },
};

/** The results of a search, or `unavailable` with the reason: no network never fails anything. */
export async function searchPictures(
  query: string,
  options: FetchOptions & { archives?: readonly string[] } = {},
): Promise<{ status: "ok" | "unavailable"; results: PictureResult[]; reason?: string }> {
  const results: PictureResult[] = [];
  const failures: string[] = [];
  for (const name of options.archives ?? Object.keys(ADAPTERS)) {
    const adapter = ADAPTERS[name];
    if (!adapter) continue;
    try {
      const { body } = await guardedFetch(adapter.url(query), { ...options, hosts: API_HOSTS });
      results.push(...adapter.parse(JSON.parse(new TextDecoder().decode(body))));
    } catch (error) {
      failures.push(`${name}: ${cleanText((error as Error).message)}`);
    }
  }
  if (!results.length && failures.length)
    return { status: "unavailable", results: [], reason: failures.join("; ") };
  return { status: "ok", results };
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** Saves one result under a name the engine makes; a type outside the list, or a file too big, is refused. */
export async function downloadPicture(
  result: PictureResult,
  dir: string,
  options: FetchOptions = {},
): Promise<{ file: string }> {
  const { body, type } = await guardedFetch(result.url, {
    ...options,
    hosts: FILE_HOSTS,
    maxBytes: options.maxBytes ?? DOWNLOAD_MAX,
  });
  const ext = EXTENSIONS[type.split(";")[0]?.trim().toLowerCase() ?? ""];
  if (!ext) throw new Error("pictures: the file's type is not an image or a video");
  const name = createHash("sha256")
    .update(`${result.archive}:${result.id}:${result.url}`)
    .digest("hex")
    .slice(0, 12);
  const file = `picture-${name}.${ext}`;
  ensureDir(dir);
  // The folder is the session's, so a planted link is never followed: the bytes land beside the name, then replace it.
  if (lstatSync(dir).isSymbolicLink()) throw new Error("pictures: the folder is a link");
  const tmp = join(dir, `.${file}.${process.pid}.tmp`);
  writeFileSync(tmp, body, { flag: "wx" });
  renameSync(tmp, join(dir, file));
  return { file };
}

// What a session searched and saved: the source and the licence of each picture stay on record.

const picturesFile = (paths: CrewPaths, id: string) => join(designDir(paths, id), "pictures.json");

interface PicturesRecord {
  found: PictureResult[];
  saved: (PictureResult & { file: string })[];
}

export function readPictures(paths: CrewPaths, id: string): PicturesRecord | null {
  return readProtectedJson<PicturesRecord>(paths, picturesFile(paths, id)).data;
}

export function savePictureResults(paths: CrewPaths, id: string, found: PictureResult[]): void {
  const saved = readPictures(paths, id)?.saved ?? [];
  ensureDir(designDir(paths, id));
  writeProtectedJson(paths, picturesFile(paths, id), { found, saved });
}

/** Downloads one result under the item's folder and records its source and licence. */
export async function savePicture(
  paths: CrewPaths,
  id: string,
  result: PictureResult,
  options: FetchOptions = {},
): Promise<string> {
  const { file } = await downloadPicture(result, join(designDir(paths, id), "pictures"), options);
  const record = readPictures(paths, id) ?? { found: [], saved: [] };
  writeProtectedJson(paths, picturesFile(paths, id), {
    ...record,
    saved: [...record.saved.filter((s) => s.file !== file), { ...result, file }],
  });
  return `design/pictures/${file}`;
}
