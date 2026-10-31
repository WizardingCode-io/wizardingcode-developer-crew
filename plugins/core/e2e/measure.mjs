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

// What a new site's page is held to (item 2026-10-30-005). Distilled from taste-skill v2.1.2's probe
// (MIT, Leonxlnx) with the proportion limits the user set (D-5); numbers only, except the fingerprint's
// font families, which are the page's computed styles, cut and restricted to the history's pattern.

/** Installed before the page's scripts when a gate run captures: counts the elements that really move, and reads the title at 1.2 s. */
export function crewMotionInit() {
  const seen = new WeakSet();
  const state = { count: 0, kinds: {}, titleLate: null };
  window.__crewMotion = state;
  const note = (el, kind) => {
    if (!el || el.nodeType !== 1 || seen.has(el)) return;
    seen.add(el);
    state.count += 1;
    state.kinds[kind] = true;
  };
  const moved = /transform|translate|opacity|scale|rotate|clip-path/;
  const start = () => {
    document.addEventListener("animationstart", (e) => note(e.target, "keyframes"), true);
    document.addEventListener("transitionrun", (e) => { if (moved.test(e.propertyName || "")) note(e.target, window.scrollY > 0 ? "scroll" : "entrance"); }, true);
    new MutationObserver((list) => {
      for (const m of list) if (moved.test(String(m.target.getAttribute && m.target.getAttribute("style")))) note(m.target, window.scrollY > 0 ? "scroll" : "entrance");
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["style"], subtree: true });
    setTimeout(() => {
      const h1 = document.querySelector("h1");
      if (!h1) return;
      let opacity = 1;
      for (let el = h1; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity);
      const hidden = getComputedStyle(h1).visibility !== "visible";
      state.titleLate = opacity < 0.5 || hidden;
    }, 1200);
  };
  if (document.documentElement) start();
  else document.addEventListener("readystatechange", start, { once: true });
}

/** What the watch counted, with the running animations at this moment added. */
export function motionReading(doc, win) {
  const state = win.__crewMotion;
  if (!state) return null;
  const running = doc.getAnimations ? doc.getAnimations().length : 0;
  return { count: state.count + running, kinds: Object.keys(state.kinds), titleLate: state.titleLate };
}

/** The page's proportions, frame, type, colour and pictures at this width, and its fingerprint. */
export function pageProbe(doc, win) {
  const W = win.innerWidth;
  const H = win.innerHeight;
  const scrollY = win.scrollY || 0;
  const style = (el) => win.getComputedStyle(el);
  const px = (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const round = (n) => Math.round(n * 100) / 100;
  const ownText = (el) => Array.from(el.childNodes || []).filter((n) => n.nodeType === 3).map((n) => n.textContent || "").join(" ").replace(/\s+/g, " ").trim();
  const shown = (s, r) => s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05 && r.width > 0 && r.height > 0;
  // Modern colours (oklch, lab, color()) reach the page as they were written: a 1x1 canvas turns any of them into bytes.
  let colourCtx = null;
  const colourCache = new Map();
  const rgb = (v) => {
    const text = String(v);
    const m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?/.exec(text);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    if (colourCache.has(text)) return colourCache.get(text);
    let out = null;
    try {
      if (!colourCtx) { const canvas = doc.createElement("canvas"); canvas.width = 1; canvas.height = 1; colourCtx = canvas.getContext("2d", { willReadFrequently: true }); }
      colourCtx.clearRect(0, 0, 1, 1);
      colourCtx.fillStyle = "#000";
      colourCtx.fillStyle = text;
      colourCtx.fillRect(0, 0, 1, 1);
      const d = colourCtx.getImageData(0, 0, 1, 1).data;
      out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch { out = null; }
    colourCache.set(text, out);
    return out;
  };
  const lum = (c) => { const f = (x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hsl = (c) => { const r = c.r / 255; const g = c.g / 255; const b = c.b / 255; const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min; if (!d) return { h: 0, s: 0, l }; const s = d / (1 - Math.abs(2 * l - 1)); let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; return { h, s, l }; };
  const family = (s) => String(s.fontFamily || "").split(",")[0].replace(/["']/g, "").trim().replace(/[^A-Za-z0-9 -]/g, "").slice(0, 60) || "unknown";
  const groundOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(style(e).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const inTag = (el, tags) => { for (let e = el; e; e = e.parentElement) if (tags.includes(String(e.tagName).toUpperCase())) return true; return false; };

  const all = doc.body ? Array.from(doc.body.querySelectorAll("*")).slice(0, 5000) : [];
  const texts = [];
  const media = [];
  const controls = [];
  const icons = [];
  for (const el of all) {
    const tag = String(el.tagName).toUpperCase();
    const r = el.getBoundingClientRect();
    const s = style(el);
    if (!shown(s, r) || r.right <= 0 || r.left >= W) continue;
    const top = r.top + scrollY;
    if (tag === "SVG") {
      const box = el.getAttribute && el.getAttribute("viewBox");
      const vb = box ? Number(String(box).trim().split(/\s+/)[2]) : 0;
      if (vb && vb <= 64) icons.push(round(r.width));
    }
    if (["IMG", "VIDEO", "PICTURE", "CANVAS"].includes(tag) || (s.backgroundImage && s.backgroundImage !== "none" && /url\(/.test(s.backgroundImage))) {
      // A picture at near-zero opacity or under a wash does not count as shipped.
      if (Number(s.opacity) >= 0.2 && r.width >= 120 && r.height >= 90 && r.width * r.height >= 19200) media.push({ top, bottom: top + r.height, left: r.left, right: r.right, w: r.width, h: r.height });
    }
    if (tag === "BUTTON" || (tag === "A" && /inline-block|flex|grid/.test(s.display) && rgb(s.backgroundColor)?.a > 0.5)) controls.push({ h: round(r.height) });
    const own = ownText(el);
    if (!own) continue;
    const size = px(s.fontSize);
    texts.push({ el, tag, text: own, size, top, bottom: top + r.height, left: r.left, right: r.right, w: r.width, h: r.height, words: own.split(" ").length, s, fam: family(s), chars: own.length, code: inTag(el, ["PRE", "CODE", "KBD", "SAMP"]), nav: inTag(el, ["NAV", "BUTTON", "FOOTER"]) });
  }

  const h1s = Array.from(doc.querySelectorAll("h1")).filter((h) => shown(style(h), h.getBoundingClientRect()));
  let title = { count: h1s.length, sizePx: 0, lines: 0, boxShare: 0, inView: false };
  if (h1s[0]) {
    const h = h1s[0];
    const r = h.getBoundingClientRect();
    const rects = h.getClientRects ? Array.from(h.getClientRects()) : [];
    const mids = new Set(rects.map((x) => Math.round((x.top + x.bottom) / 2 / (px(style(h).lineHeight) || 20))));
    title = { count: h1s.length, sizePx: round(px(style(h).fontSize)), lines: Math.max(1, Math.round(r.height / (px(style(h).lineHeight) || px(style(h).fontSize) * 1.2)), rects.length > 1 ? mids.size : 1), boxShare: round(r.height / H), inView: r.top + scrollY < H };
  }
  const reading = texts.filter((t) => t.chars >= 40 && !t.nav && !t.code);
  const byChars = {};
  for (const t of reading) byChars[t.size] = (byChars[t.size] || 0) + t.chars;
  const bodySize = Number(Object.keys(byChars).sort((a, b) => byChars[b] - byChars[a])[0] || 0);
  const displaySize = texts.reduce((m, t) => (t.tag === "H1" || t.size >= 22 ? Math.max(m, t.size) : m), 0);

  const totalChars = texts.reduce((n, t) => n + t.chars, 0) || 1;
  const fam = {};
  for (const t of texts) fam[t.fam] = (fam[t.fam] || 0) + t.chars;
  const families = Object.keys(fam).filter((f) => fam[f] / totalChars >= 0.02);
  const sizes = new Set(texts.map((t) => Math.round(t.size)));

  const lowContrast = texts.filter((t) => { const c = rgb(t.s.color); if (!c || c.a < 0.5 || t.nav) return false; return contrast(c, groundOf(t.el)) < 2.6; }).length;

  let eyebrows = 0;
  let microLabels = 0;
  for (const t of texts) {
    const spaced = px(t.s.letterSpacing) >= 0.05 * t.size;
    if (t.size <= 14 && t.s.textTransform === "uppercase" && spaced && !t.nav) microLabels += 1;
    if (t.nav || t.chars > 44 || t.tag.startsWith("H")) continue;
    const under = texts.find((o) => /^H[1-4]$/.test(o.tag) && o.top >= t.bottom - 2 && o.top - t.bottom <= Math.min(140, Math.max(72, 1.1 * o.size)) && o.left < t.right && o.right > t.left);
    if (under && t.size <= Math.min(18, 0.5 * under.size)) eyebrows += 1;
  }

  let covered = 0;
  if (doc.elementFromPoint) {
    for (const t of texts.filter((x) => x.size >= 24 && x.top - scrollY < H && x.bottom - scrollY > 0).slice(0, 40)) {
      const rect = t.el.getBoundingClientRect();
      let foreign = 0;
      for (let i = 0; i < 8; i++) {
        const hit = doc.elementFromPoint(rect.left + ((i + 0.5) / 8) * rect.width, rect.top + rect.height / 2);
        if (hit && hit !== t.el && !(t.el.contains && t.el.contains(hit)) && !(hit.contains && hit.contains(t.el))) foreign += 1;
      }
      if (foreign >= 2) covered += 1;
    }
  }
  const clipped = texts.filter((t) => /hidden|clip/.test(t.s.overflowX || "") && t.el.scrollWidth > t.el.clientWidth + 1).length;

  const docH = Math.max(doc.documentElement.scrollHeight || 0, H);
  const blocks = [...texts, ...media].filter((b) => b.h > 0);
  const lefts = blocks.map((b) => b.left).sort((a, b) => a - b);
  const rights = blocks.map((b) => b.right).sort((a, b) => a - b);
  const pct = (list, p) => (list.length ? list[Math.min(list.length - 1, Math.floor(list.length * p))] : 0);
  const marginLeft = round(pct(lefts, 0.02));
  const marginRight = round(W - pct(rights, 0.98));

  const rows = new Array(Math.ceil(docH / 4) + 1).fill(false);
  for (const b of blocks) for (let y = Math.floor(b.top / 4); y <= Math.floor(b.bottom / 4) && y < rows.length; y++) if (y >= 0) rows[y] = true;
  const gaps = [];
  let run = 0;
  let lastFilled = -1;
  for (let y = 0; y < rows.length; y++) { if (rows[y]) { if (run && lastFilled >= 0) gaps.push(run * 4); run = 0; lastFilled = y; } else run += 1; }
  const screens = Math.max(1, Math.ceil(docH / H));
  let emptyScreens = 0;
  for (let i = 0; i < screens; i++) {
    const a = i * H;
    const b = Math.min(docH, a + H);
    if (b - a < H * 0.5) continue;
    let area = 0;
    for (const x of blocks) { const o = Math.min(b, x.bottom) - Math.max(a, x.top); if (o > 0) area += o * x.w; }
    if (area / (W * H) < 0.2) emptyScreens += 1;
  }

  const root = doc.querySelector ? doc.querySelector("main") || doc.body : doc.body;
  const sectionEls = Array.from(doc.querySelectorAll("section")).filter((s) => s.getBoundingClientRect().height >= 200);
  const tops = sectionEls.length ? sectionEls : Array.from((root && root.children) || []).filter((c) => c.getBoundingClientRect().height >= 200);
  const within = (b, r) => b.top >= r.top + scrollY - 1 && b.bottom <= r.bottom + scrollY + 1;
  let untitled = 0;
  let lopsided = 0;
  const contentBounds = [];
  const shapes = [];
  let iconCards = 0;
  for (const sec of tops) {
    const r = sec.getBoundingClientRect();
    const inside = blocks.filter((b) => within(b, r));
    const words = texts.filter((t) => within(t, r)).reduce((n, t) => n + t.words, 0);
    const heading = texts.some((t) => within(t, r) && (/^H[1-6]$/.test(t.tag) || t.size >= 22));
    if (words >= 30 && r.height >= 200 && !heading) untitled += 1;
    if (inside.length) {
      const left = Math.min(...inside.map((b) => b.left));
      const right = Math.max(...inside.map((b) => b.right));
      const empty = Math.max(left, W - right);
      if (words >= 12 && r.height >= 180 && empty >= 0.42 * W) lopsided += 1;
      contentBounds.push({ top: Math.min(...inside.map((b) => b.top)), bottom: Math.max(...inside.map((b) => b.bottom)) });
    }
    const boxes = Array.from(sec.querySelectorAll("*")).filter((c) => { const b = c.getBoundingClientRect(); return b.width >= 150 && b.height >= 90 && b.width < 0.6 * W; });
    const widths = {};
    for (const b of boxes) { const k = Math.round(b.getBoundingClientRect().width / 6); widths[k] = (widths[k] || []); widths[k].push(b); }
    let shape = "stack";
    for (const k of Object.keys(widths)) {
      const list = widths[k].filter((b) => !widths[k].some((o) => o !== b && o.contains && o.contains(b)));
      if (list.length >= 3) {
        shape = "grid";
        const withIcon = list.filter((b) => Array.from(b.querySelectorAll("svg,img")).some((i) => { const q = i.getBoundingClientRect(); return q.width <= 64 && q.height <= 64; }));
        const boxed = list.filter((b) => { const q = style(b); return px(q.borderTopWidth) > 0 || (rgb(q.backgroundColor) || { a: 0 }).a > 0.5; });
        if (withIcon.length >= list.length - 1 && boxed.length >= list.length - 1) iconCards += 1;
      }
    }
    if (shape === "stack") {
      const bigMedia = media.filter((m) => within(m, r) && m.w * m.h >= 0.5 * r.width * r.height);
      const cols = new Set(inside.map((b) => (b.left + b.right) / 2 < W / 2 ? "l" : "r"));
      if (bigMedia.length) shape = "media";
      else if (cols.size === 2 && inside.some((b) => b.right < W * 0.6) && inside.some((b) => b.left > W * 0.4)) shape = "split";
      else if (inside.filter((b) => /^(LI|TR|DT)$/.test(b.tag || "")).length >= 4) shape = "list";
    }
    shapes.push(shape);
  }
  const sectionGaps = [];
  for (let i = 1; i < contentBounds.length; i++) sectionGaps.push(Math.round(contentBounds[i].top - contentBounds[i - 1].bottom));

  const navs = Array.from(doc.querySelectorAll("nav")).map((n) => n.getBoundingClientRect()).filter((r) => r.top < H * 0.5);
  const navShare = navs.length ? round(Math.max(...navs.map((r) => r.height)) / H) : 0;

  // The ground is what covers the most of the page: a site's colour often sits on html or on a wrapper, not on body.
  const coverage = new Map();
  const noteGround = (c, area) => { if (!c || c.a < 0.5) return; const k = `${c.r},${c.g},${c.b}`; coverage.set(k, { c, area: (coverage.get(k)?.area || 0) + area }); };
  const page = W * docH;
  const wideBlocks = all.filter((el) => { const r = el.getBoundingClientRect(); return r.width >= 0.7 * W && r.height >= 150; });
  let paintedArea = 0;
  for (const el of wideBlocks) { const c = rgb(style(el).backgroundColor); if (c && c.a >= 0.5) { const r = el.getBoundingClientRect(); noteGround(c, r.width * r.height); paintedArea += r.width * r.height; } }
  const baseColour = rgb(style(doc.body || doc.documentElement).backgroundColor);
  const rootColour = doc.documentElement ? rgb(style(doc.documentElement).backgroundColor) : null;
  noteGround(baseColour && baseColour.a >= 0.5 ? baseColour : rootColour && rootColour.a >= 0.5 ? rootColour : { r: 255, g: 255, b: 255, a: 1 }, Math.max(0, page - paintedArea));
  const ground = [...coverage.values()].sort((a, b) => b.area - a.area)[0]?.c ?? { r: 255, g: 255, b: 255, a: 1 };
  const g = hsl(ground);
  // The accent: the most saturated colour a control or a link uses, else the most saturated any text or surface uses.
  let accent = null;
  const consider = (el) => {
    const s = style(el);
    for (const c of [rgb(s.backgroundColor), rgb(s.color)]) { if (!c || c.a < 0.5) continue; const q = hsl(c); if (q.s > 0.25 && q.l > 0.1 && q.l < 0.9 && (!accent || q.s > accent.s)) accent = q; }
  };
  for (const el of all) { const tag = String(el.tagName).toUpperCase(); if (tag === "A" || tag === "BUTTON") consider(el); }
  if (!accent) for (const el of all) consider(el);
  const hueName = (h) => (h < 20 || h >= 340 ? "red" : h < 45 ? "orange" : h < 70 ? "yellow" : h < 165 ? "green" : h < 200 ? "teal" : h < 255 ? "blue" : h < 300 ? "purple" : "pink");
  const lightName = g.l > 0.85 ? "light" : g.l < 0.2 ? "dark" : "mid";
  // The look a generated page falls into when nothing asks otherwise: a cream ground, a terracotta or violet accent.
  const creamGround = g.h >= 22 && g.h <= 62 && g.s >= 0.16 && g.l >= 0.88 && g.l <= 0.995;
  const terracotta = !!accent && accent.h >= 6 && accent.h <= 30 && accent.s >= 0.38 && accent.l >= 0.25 && accent.l <= 0.72;
  const violet = !!accent && accent.h >= 244 && accent.h <= 295 && accent.s >= 0.42;
  const temp = g.s < 0.08 ? "neutral" : g.h < 80 || g.h >= 300 ? "warm" : "cold";
  const heroRect = tops[0] ? tops[0].getBoundingClientRect() : null;
  let hero = "text-only";
  if (heroRect) {
    const m = media.filter((x) => within(x, heroRect));
    const t = texts.filter((x) => within(x, heroRect));
    const big = m.find((x) => x.w >= 0.7 * W);
    const centred = t.length && t.every((x) => /center/.test(x.s.textAlign));
    if (big) hero = "media-full";
    else if (m.length && t.length) {
      const mx = m[0].left + m[0].w / 2;
      const tx = t[0].left + t[0].w / 2;
      hero = Math.abs(mx - tx) < W * 0.15 ? "stacked" : mx > tx ? "text-left-media-right" : "text-right-media-left";
    } else if (centred) hero = "centred-text";
  }
  const display = texts.filter((t) => t.tag === "H1" || t.size === displaySize)[0];
  const body = reading[0];
  return {
    width: W,
    height: H,
    title,
    displayPx: round(displaySize),
    bodyPx: round(bodySize),
    controls: controls.map((c) => c.h),
    icons,
    sectionGaps,
    navShare,
    margins: { left: marginLeft, right: marginRight },
    blankGaps: gaps,
    emptyScreens,
    untitled,
    lopsided,
    iconCards,
    families: families.length,
    sizes: sizes.size,
    lowContrast,
    eyebrows,
    microLabels,
    covered,
    clipped,
    pictures: media.length,
    aiLook: creamGround ? (terracotta ? "cream ground with a terracotta accent" : "a cream ground") : violet ? "a violet accent" : null,
    compRegions: Array.from(doc.querySelectorAll("[data-comp]")).slice(0, 60).map((el) => {
      const r = el.getBoundingClientRect();
      return { id: String(el.getAttribute("data-comp")).replace(/[^a-z0-9-]/g, "").slice(0, 40), x: round((r.left / W) * 100), y: round(((r.top + scrollY) / H) * 100), w: round((r.width / W) * 100), h: round((r.height / H) * 100) };
    }),
    fingerprint: {
      display: display ? display.fam : "unknown",
      body: body ? body.fam : "unknown",
      palette: `${lightName}-${temp}-${accent ? hueName(accent.h) : "none"}`,
      sections: shapes.join(",") || "stack",
      hero,
    },
  };
}
