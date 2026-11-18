# The scrub

How the clip is driven by the scroll, how words stay legible over it, what a phone gets, and how the session tests its own build. The numbers are starting points, tuned by scrolling the page.

## The stage

A tall section holds a stage that sticks to the viewport for the section's whole height. How far the visitor has scrolled through the section, from 0 to 1, is the clip's position. The page proper begins where the clip ends, on its last frame.

```html
<section class="film" data-film>
  <div class="film-stage">
    <video muted playsinline aria-hidden="true" tabindex="-1"></video>
    <div class="film-scrim" aria-hidden="true"></div>
    <div class="film-line" data-window="0,0.3"><h1>The first words</h1></div>
    <div class="film-line" data-window="0.36,0.66"><p>The second beat</p></div>
    <div class="film-line" data-window="0.72,1"><p>The arrival</p><a class="button" href="#start">The one action</a></div>
  </div>
</section>
```

Set the section's height in viewport heights, not in seconds: about 400vh for a clip of six seconds, and more for a longer journey, so that each beat has room to be read. The stage is one viewport tall, so a section of 400vh gives 300vh of scroll, and a window of 0.3 of progress is 90vh of it.

The base CSS. The page as it stands with no script is the still: the poster, every line visible, in the normal flow. The film is what the engine adds when it arms, by one class, `film-armed`. So a script that fails, is blocked or has not run yet leaves a whole page.

```css
/* The still: with no script, under the five conditions, and until the engine arms. */
.film { position: relative; }
.film-stage { position: relative; min-height: 100svh; display: grid; align-content: center; gap: 2rem;
  padding: 12vh 6vw; background: url("assets/film-poster.jpg") center / cover no-repeat; }
.film video { display: none; }
.film-line { position: relative; z-index: 1; isolation: isolate; max-width: 36rem; }

/* The film: set by the engine when it arms, and by nothing else. */
.film-armed { height: 400vh; }
.film-armed .film-stage { position: sticky; top: 0; display: block; height: 100svh; min-height: 0;
  padding: 0; overflow: hidden; }
.film-armed video { display: block; position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: cover; opacity: 0; transition: opacity 0.6s ease; will-change: transform; }
.film-armed.film-ready video { opacity: 1; }
.film-armed.film-failed video { display: none; }
.film-armed .film-line { position: absolute; left: 6vw; bottom: 14vh; opacity: 0; visibility: hidden; }
```

`film-armed` turns the section into the tall stage and takes the lines out of the flow; the engine then writes each line's opacity. `film-ready` shows the clip over the poster once it can play. `film-failed` leaves the poster under the lines. The still's stage grows with its content, so nothing is cut on a small screen. Give each line its own place in both layouts: in the film, the calm region of its frames; in the still, a composition of its own. Keep these rules in this order, the still first: a later rule of the same weight wins.

## The engine

One script. It asks for the clip from the site's own folder, drives it, and writes the windows of text. It loads nothing from another host. Put it in a plain script element directly after the section, not deferred and not as a module: it then arms before the page is first painted, and the visitor who gets the film never sees the still jump into it. It is one function called at once, in strict mode, so none of its names becomes a name of the page. The stylesheet stands in the head, before it: the engine reads the stage's height when it starts.

```js
(() => {
"use strict";
const FILM = "assets/film.mp4";
const POSTER = "assets/film-poster.jpg";
const TYPE = "video/mp4"; // said here, so that a host's header for the file does not decide it
const MAX_BYTES = 16 * 1024 * 1024; // a larger clip is not loaded: the still hero stands
const EASE = 0.16; // the share of the gap closed in one frame at 60 frames a second
const STILL = [
  "(max-width: 720px)",
  "(orientation: portrait) and (max-width: 1024px)",
  "(orientation: portrait) and (pointer: coarse)",
  "(orientation: landscape) and (pointer: coarse) and (max-height: 560px)",
  "(prefers-reduced-motion: reduce)",
];

const stage = document.querySelector("[data-film]"); // the whole section: the classes go here
const video = stage.querySelector("video");
const lines = [...stage.querySelectorAll("[data-window]")].map((el) => {
  const [from, to] = (el.dataset.window || "0,1").split(",").map(Number);
  return { el, from: from || 0, to: to > from ? to : 1, opacity: -1, k: -1 };
});

let armed = false;
let asked = false;
let onScreen = true;
let goal = 0;
let at = 0;
let frame = 0;
let before = 0;
let seeking = false;
let wanted = null;
let watchdog = 0;

const clamp = (value) => Math.min(1, Math.max(0, value));
const ramp = (p, from, to) => {
  const t = clamp((p - from) / (to - from));
  return t * t * (3 - 2 * t);
};

// How far the visitor is through the stage, from 0 to 1.
function progress() {
  const box = stage.getBoundingClientRect();
  const span = box.height - window.innerHeight;
  return span > 0 ? clamp(-box.top / span) : 0;
}

// One seek in flight at a time. The newest position asked for waits, and the older ones are dropped.
function seek(time) {
  if (!Number.isFinite(video.duration)) return;
  if (seeking) {
    wanted = time;
    return;
  }
  if (Math.abs(video.currentTime - time) < 0.01) return; // already there: a seek would cost and change nothing
  seeking = true;
  video.currentTime = time;
  clearTimeout(watchdog);
  watchdog = setTimeout(release, 500); // a seek that never reports must not hold the gate shut
}
function release() {
  clearTimeout(watchdog);
  seeking = false;
  if (wanted === null) return;
  const time = wanted;
  wanted = null;
  seek(time);
}
video.addEventListener("seeked", release);
video.addEventListener("error", () => {
  clearTimeout(watchdog);
  seeking = false;
  wanted = null;
  stage.classList.add("film-failed");
});

// Each line of text owns a window of progress. The page is written only when a value has changed.
function write(p) {
  lines.forEach((line, index) => {
    const edge = Math.min(0.02, (line.to - line.from) / 3);
    const rise = index === 0 ? 1 : ramp(p, line.from, line.from + edge);
    const fall = index === lines.length - 1 ? 1 : 1 - ramp(p, line.to - edge, line.to);
    const opacity = Math.round(rise * fall * 100) / 100;
    // The first line is there before any scroll, entrance included.
    const k = index === 0 ? 1 : Math.round(clamp((p - line.from) / (edge * 1.25)) * 100) / 100;
    if (opacity !== line.opacity) {
      line.opacity = opacity;
      line.el.style.opacity = String(opacity);
      // A line outside its window takes no focus and no click: its one action is not there yet.
      line.el.style.visibility = opacity < 0.1 ? "hidden" : "visible";
    }
    if (k !== line.k) {
      line.k = k;
      line.el.style.setProperty("--k", String(k));
    }
  });
}

// The position on screen moves toward the scroll's by a share that is the same at every frame
// rate. The loop stops when it has arrived, and is not started while the stage is off screen.
function step(now) {
  if (!armed) return;
  const elapsed = Math.min(100, now - (before || now));
  before = now;
  const share = 1 - Math.pow(1 - EASE, elapsed / 16.667);
  at += (goal - at) * share;
  const arrived = Math.abs(goal - at) < 0.0005;
  if (arrived) at = goal;
  seek(at * video.duration);
  write(at);
  if (arrived) {
    frame = 0;
    before = 0;
  } else {
    frame = requestAnimationFrame(step);
  }
}

function onScroll() {
  if (!armed) return; // a late event must not write into the still
  goal = progress();
  if (!frame && onScreen) frame = requestAnimationFrame(step);
}

// The whole clip as a Blob: a host that cannot serve a part of a file cannot seek in it.
async function load() {
  try {
    const response = await fetch(FILM);
    const size = Number(response.headers.get("Content-Length")) || 0;
    if (!response.ok || size > MAX_BYTES) throw new Error("no film");
    const blob = new Blob([await response.arrayBuffer()], { type: TYPE });
    if (blob.size > MAX_BYTES) throw new Error("no film");
    video.preload = "auto"; // the clip is already here: let the browser read it
    video.src = URL.createObjectURL(blob); // kept for the page's life: there is one clip
    video.addEventListener(
      "canplay",
      () => {
        stage.classList.add("film-ready"); // true whether armed or not: the clip is here
        onScroll();
      },
      { once: true },
    );
  } catch {
    stage.classList.add("film-failed"); // the poster carries the page
  }
}

// The poster first, then the clip, and neither where the still hero stands.
function ask() {
  if (asked) return;
  asked = true;
  const poster = new Image();
  poster.onload = load;
  poster.onerror = load;
  poster.src = POSTER;
}

function arm() {
  if (armed) return;
  armed = true;
  ask();
  for (const line of lines) {
    line.opacity = -1;
    line.k = -1;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function disarm() {
  if (!armed) return;
  armed = false;
  window.removeEventListener("scroll", onScroll);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  before = 0;
  for (const line of lines) {
    line.el.style.removeProperty("opacity");
    line.el.style.removeProperty("visibility");
    line.el.style.removeProperty("--k");
  }
}

// The same five conditions as the CSS, heard while the page is open: a turned tablet, a resized
// window and a changed setting each switch between the film and the still.
const conditions = STILL.map((query) => window.matchMedia(query));
function decide() {
  const still = conditions.some((condition) => condition.matches);
  stage.classList.toggle("film-armed", !still);
  if (still) disarm();
  else arm();
}
for (const condition of conditions) condition.addEventListener("change", decide);

new IntersectionObserver(([entry]) => {
  onScreen = entry.isIntersecting;
  if (onScreen && armed) onScroll();
}).observe(stage);

decide();
})();
```

What each part is for:

- **The Blob.** Its type is said in the script, so a host that sends the file under a general type does not stop it playing. Many hosts do not serve a part of a file on request. On such a host every seek falls back to the start, and the film that worked on the session's machine stands still when it is live. A clip held whole in memory seeks everywhere. Above `MAX_BYTES` the clip is not loaded at all and the still hero stands.
- **The eased position.** Writing the scroll straight into the clip's time makes it jerk. The position on screen closes a share of the gap each frame, and the exponent makes that share the same on a screen of 60 and of 120 frames a second. The loop asks for no frame once it has arrived, and a scroll does not start it while the stage is off screen.
- **The gate on seeks.** A seek asked for while another is in flight piles up, and that is what stutters. One at a time, the newest kept. The gate is freed by `seeked`, by the clip's `error`, and by a timer of half a second for a seek that reports neither.
- **Writes on change.** A style written every frame is the other cause of a rough scroll. Each value is compared with the last one written.

The video has its own layer (`will-change: transform` in the base CSS) so that its repaint does not drag the page.

## The windows of text

Each line owns a window of progress, written on its element. A visitor reads a scrolling page in flicks of a wheel, so a window is paced in distance and not in time.

- A line is fully visible for most of its window, with a short eased rise and fall at its edges. Aim at 80 to 130vh of scroll for a window: on a stage of 400vh that is 0.27 to 0.43 of progress. The engine's edge is 0.02 of progress at most, 6vh on that stage, and a third of a short window.
- The first line is there before any scroll, and the last stays.
- Leave a gap between two windows of at least one edge, as the sample does, or give the two lines different places: where windows touch, both lines are half visible at once, and at one place their words print over each other.
- A line outside its window is hidden from the keyboard, the pointer and assistive technology, so the one action cannot be reached before its line arrives, and a reader who does not scroll meets only the line on screen. So the film's words and its one action also stand in the page proper below it, in the normal flow: nobody depends on the film to read them or to act.
- `--k` runs from 0 to 1 as a line arrives. An entrance is drawn from it in CSS, with `transform` and `opacity` alone, so that scrolling back undoes it. Let each entrance echo what the film does at that moment: words that sink into place while the subject descends, a word that lands as something lands.
- Test the windows by stepping the scroll: 120 px at a time, then 240, then 360, with a pause between steps, and read each line's opacity after each step. A line that is fully visible for fewer than five steps of 120 px gives a reader too little time. A line that is never fully visible at steps of 360 px can be skipped past. Join such a line to its neighbour; do not shorten the edges.

## Words over moving footage

The footage behind the words changes with every frame, and the session does not choose the frame a visitor stops on. Three layers:

```css
.film-scrim { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 115% 95% at 50% 48%, rgb(8 8 14 / 0) 40%, rgb(8 8 14 / 0.58) 100%); }
.film-line::before { content: ""; position: absolute; inset: -4%; z-index: -1; pointer-events: none;
  opacity: calc(0.25 + 0.75 * var(--k, 1));
  background: radial-gradient(ellipse 70% 60% at center, rgb(6 6 10 / 0.64) 0%, rgb(6 6 10 / 0.4) 50%, rgb(6 6 10 / 0) 80%); }
.film-line { text-shadow: 0 1px 2px rgb(6 6 10 / 0.95), 0 3px 12px rgb(6 6 10 / 0.75); }
.film-line .button { text-shadow: none; }
```

- A base scrim over the whole clip, always on.
- A scrim behind each line, which deepens as the line arrives and fades toward the corners, so the footage dims under the words and nowhere else. Where the subject stands in the centre with words on both sides, give each side its own and leave the centre alone.
- A shadow on the text, and none on a button's label.

The measure is the crew's standard: each line's text against the worst frame of its window holds 4.5:1, or 3:1 for large text. Take the frames of a line's window (its window times the clip's length gives the seconds), find, for light text, the lightest pixel behind the words once the scrims are laid over it, and compute the ratio against it. Deepen that line's scrim until the worst frame holds, and never tune against an average frame. With a browser the session can drive, make the glyphs transparent and take their shadow off, take a capture with the scroll at that point and read the pixels of the text's box: that measures every layer as the visitor sees it. Do not hide the line itself: its scrim is drawn by the line and would go with it.

## The still hero

For some visitors the opening is a composed still and not the film: the poster or the ending frame, with every line visible. It is a layout of its own and not an apology, and it is the page's default: the engine arms the film only when none of the five conditions holds, and hears them change while the page is open. The same five strings stand in the script and in the CSS, where they keep the clip hidden whatever class is set.

```css
@media (max-width: 720px),
  (orientation: portrait) and (max-width: 1024px),
  (orientation: portrait) and (pointer: coarse),
  (orientation: landscape) and (pointer: coarse) and (max-height: 560px),
  (prefers-reduced-motion: reduce) {
  .film video { display: none !important; }
}
```

Under any of the five the clip is never asked for: the request lives inside the path the script takes only when it arms. A scrub on a phone is a decision made on purpose, and only where the clip is small, its composition survives a portrait crop, and it has been seen on a real phone.

## Complete without the clip

The page is whole when the clip never arrives: the poster behind every line, every section and the one action working. `film-failed` takes the video away and leaves the poster, and the lines still follow the scroll. With no script at all the page is the still.

## The motion of the page below

- Everything eases. The tokens name two easing curves, and nothing eases by any other.
- A section's parts arrive in sequence, 60 to 150 ms apart, once. The delays are removed when the entrance is over, or every later hover lags by them.
- One living element in a section, at a whisper, with a cycle of four seconds or longer, paused off screen and on a hidden tab.
- One thing the visitor does, taken from what the subject is: an action held, with progress that builds while it is held and eases back when it is let go. Under reduced motion the finished state is there at once.
- Only `transform` and `opacity` move. A glow is a layer whose opacity moves.
- A reveal that clips text leaves room for the tails of g, y and p.
- `overflow-x: clip` on the page, so nothing scrolls it sideways.
- Reduced motion is honoured whole and while the page is open: every drawn line finished, every counter at its number, and back again when the setting is turned off.

## The self-test

Run by the session, before the user sees the page. Prove each; assume none.

1. Capture the page at 1440 by 900, 1280 by 800, 375 by 812 and 375 by 667.
2. Use every button and link, and send the form.
3. Scrub near the start, halfway and near the end of the stage, then fast. A film that flashes more than three times in a second fails the norm the Visual craft skill holds.
4. Step the scroll at 120, 240 and 360 px and read each line's opacity: every line readable for five steps of 120 px, none skipped at 360 px.
5. Measure each line against the worst frame of its window: 4.5:1, or 3:1 for large text.
6. See every entrance play.
7. Try to push the page sideways: an anchor link, a narrow width.
8. Load with scripts off: the still, every line visible and none cut. Load with reduced motion on: every line visible, and no request for the clip. Then, with the page already open, switch reduced motion on, and off again.
9. Load with the clip blocked: the page whole over the poster.
10. Turn a tablet's width from portrait to landscape and back: the film and the still each take over.
11. Read the console at desktop and at phone width: no error.
12. Last, come to the page as someone who has never seen it: does each thing have its place, is one of a set of like things unlike the rest, is any part only filling space.
13. Read the page as it stands with the film's section taken out: the film's words and its one action are also there, in the normal flow.
