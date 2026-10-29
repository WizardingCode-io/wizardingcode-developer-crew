// The in-page measurements of the crew's Playwright fixture (2026-10-29-001, P-1 and P-3). Each is a
// self-contained function the fixture serialises into the page with `document` and `window`, and the
// engine's tests run against a DOM-shaped fake: nothing outside its own body is reachable from it.
// Every string it returns is the page's own content, so each is cut, flattened to one line and
// stripped of control characters here, and shown by the engine as quoted data, never an instruction.
// Distilled from taste-skill v2.1.2 (MIT, Leonxlnx: its overflow, image, font and reduced-motion
// probes) in the crew's words (ADR 0017).

/** The horizontal overflow of the page at this width, in CSS pixels, and up to five offenders widest first. */
export function measureOverflow(doc, win) {
  const describe = (el) => {
    const tag = String(el.tagName || "").toLowerCase();
    const clean = (s) => String(s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "");
    const id = el.id ? `#${clean(el.id)}` : "";
    const first = typeof el.className === "string" ? clean(el.className.trim().split(/\s+/)[0]) : "";
    return `${tag}${id || (first ? `.${first}` : "")}`.slice(0, 80);
  };
  const width = win.innerWidth;
  const overflowPx = Math.max(0, Math.round(doc.documentElement.scrollWidth - width));
  if (!overflowPx) return { overflowPx: 0, offenders: [] };
  const offenders = [];
  const elements = doc.body ? doc.body.querySelectorAll("*") : [];
  for (const el of Array.from(elements).slice(0, 5000)) {
    const right = Math.round(el.getBoundingClientRect().right);
    if (right > width) offenders.push({ target: describe(el), right });
  }
  offenders.sort((a, b) => b.right - a.right);
  return { overflowPx, offenders: offenders.slice(0, 5) };
}

/** The images that finished loading with no pixels, at most ten, an image with no source left out, each source reduced: a data URI to its type, a web address to its origin and its last path segment (a path can carry a token), anything else to its scheme. */
export function brokenImages(doc) {
  const reduce = (src) => {
    const text = String(src || "");
    if (text.startsWith("data:")) return `data:${text.slice(5).split(/[;,]/)[0]}`.slice(0, 120);
    try {
      const url = new URL(text);
      if (url.protocol === "http:" || url.protocol === "https:") {
        const segments = url.pathname.split("/").filter(Boolean);
        const last = segments[segments.length - 1] ?? "";
        const path = segments.length > 1 ? `/…/${last}` : `/${last}`;
        return `${url.protocol}//${url.host}${path}`.slice(0, 120);
      }
      return url.protocol;
    } catch {
      return "";
    }
  };
  const out = [];
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const src = img.currentSrc || img.src;
    if (!src) continue;
    if (img.complete && img.naturalWidth === 0) out.push(reduce(src));
    if (out.length >= 10) break;
  }
  return out;
}

/** The font families the page declared that did not load, once the fonts settled: at most ten, each one line cut at 80. */
export async function fontsNotLoaded(doc) {
  await doc.fonts.ready;
  const out = [];
  for (const face of Array.from(doc.fonts)) {
    if (face.status === "loaded") continue;
    const family = String(face.family || "")
      .split(/\r?\n/)[0]
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
      .replace(/^["']|["']$/g, "")
      .trim()
      .slice(0, 80);
    if (family && !out.includes(family)) out.push(family);
    if (out.length >= 10) break;
  }
  return out;
}

/** The text blocks of the first screen (elements with text of their own) and whether each is visible. */
export function textBlocks(doc, win) {
  const describe = (el) => {
    const tag = String(el.tagName || "").toLowerCase();
    const clean = (s) => String(s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "");
    const id = el.id ? `#${clean(el.id)}` : "";
    const first = typeof el.className === "string" ? clean(el.className.trim().split(/\s+/)[0]) : "";
    return `${tag}${id || (first ? `.${first}` : "")}`.slice(0, 80);
  };
  const out = [];
  const elements = doc.body ? doc.body.querySelectorAll("*") : [];
  for (const el of Array.from(elements).slice(0, 5000)) {
    const own = Array.from(el.childNodes || [])
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!own) continue;
    const rect = el.getBoundingClientRect();
    if (rect.top >= win.innerHeight || rect.bottom <= 0) continue;
    const style = win.getComputedStyle(el);
    out.push({
      target: describe(el),
      text: own.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").slice(0, 80),
      visible: Number(style.opacity) > 0 && style.visibility === "visible",
    });
  }
  return out;
}

/** The blocks visible in the first reading and hidden in the second (the reduced-motion pass), at most ten. */
export function hiddenText(before, after) {
  const key = (b) => `${b.target}\u0000${b.text}`;
  const later = new Map(after.map((b) => [key(b), b]));
  const out = [];
  for (const block of before) {
    const now = later.get(key(block));
    if (block.visible && now && !now.visible) out.push({ target: block.target, text: block.text });
    if (out.length >= 10) break;
  }
  return out;
}

/** App-screen evidence, numbers only: the numeric table cells and their right-aligned and tabular shares, each chart's hues, the widest sidebar's share of the viewport. */
export function appMeasures(doc, win) {
  const share = (n, of) => (of ? Math.round((n / of) * 100) / 100 : 0);
  const numeric = Array.from(doc.querySelectorAll("td,th")).filter((cell) => {
    const text = Array.from(cell.childNodes || [])
      .map((n) => n.textContent || "")
      .join("")
      .trim();
    return /\d/.test(text) && /^[-+]?[\d.,\s%$€£]+$/.test(text);
  });
  let right = 0;
  let tabular = 0;
  for (const cell of numeric) {
    const style = win.getComputedStyle(cell);
    if (style.textAlign === "right" || style.textAlign === "end") right += 1;
    if (String(style.fontVariantNumeric).includes("tabular-nums")) tabular += 1;
  }
  const chartHues = [];
  for (const svg of Array.from(doc.querySelectorAll("svg"))) {
    const marks = Array.from(svg.querySelectorAll("rect,circle,path,line,polygon"));
    if (marks.length <= 4) continue;
    const fills = new Set(marks.map((m) => win.getComputedStyle(m).fill).filter((f) => f && f !== "none"));
    chartHues.push(fills.size);
  }
  let sidebarShare = 0;
  for (const el of Array.from(doc.querySelectorAll("nav,aside"))) {
    const s = share(el.getBoundingClientRect().width, win.innerWidth);
    if (s > 0.3 && s > sidebarShare) sidebarShare = s;
  }
  return {
    width: win.innerWidth,
    numericCells: numeric.length,
    rightAlignedShare: share(right, numeric.length),
    tabularShare: share(tabular, numeric.length),
    chartHues,
    sidebarShare,
  };
}
