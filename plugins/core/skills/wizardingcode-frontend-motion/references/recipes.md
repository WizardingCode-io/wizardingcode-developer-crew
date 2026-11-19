# Recipes

Ten pieces of code, given whole. Each needs the browser alone: no library, nothing fetched. Each carries its form under reduced motion, and its feature test where the feature is not in every browser a project supports. Copy a piece, rename its classes to the project's, and take every value from the project's tokens.

The values in the code are the frontend standard's (`plugins/core/skills/crew/references/frontend.md` and `frontend-site.md`), or a choice the piece's text names as the skill's own.

### 1. The tokens

One place for the curves and the lengths. A project that has tokens already extends them and adds none beside them.

```css
:root {
  --ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-move: ease-in-out;
  --ease-hover: ease;
  --time-feedback: 120ms;
  --time-frequent: 200ms;
  --time-occasional: 300ms;
  --time-entrance: 700ms;
  --time-signature: 800ms;
}
```

### 2. A spring as `linear()`

CSS has no spring. It has `linear()`, a list of stops the browser joins with straight lines, and a damped spring's curve can be sampled into one. The function takes the duration the spring reads as and its bounce, and returns the easing and the time the easing must run for. The run is longer than the duration, because a spring's tail is slow.

```js
function springLinear(duration = 0.4, bounce = 0, points = 32) {
  // The spring's natural frequency from the duration it reads as; its damping from the bounce.
  const frequency = (2 * Math.PI) / duration;
  const damping = Math.min(1, Math.max(0.05, 1 - bounce));
  const place = (time) => {
    const decay = Math.exp(-damping * frequency * time);
    if (damping >= 1) return 1 - decay * (1 + frequency * time);
    const swing = frequency * Math.sqrt(1 - damping * damping);
    return (
      1 - decay * (Math.cos(swing * time) + ((damping * frequency) / swing) * Math.sin(swing * time))
    );
  };
  // The run ends where what is left of the travel is under a thousandth of it.
  const run =
    damping >= 1
      ? 9.23 / frequency
      : Math.log(1000 / Math.sqrt(1 - damping * damping)) / (damping * frequency);
  const stops = [];
  for (let i = 0; i <= points; i++)
    stops.push(i === points ? 1 : Number(place((run * i) / points).toFixed(3)));
  return { easing: `linear(${stops.join(", ")})`, durationMs: Math.round(run * 1000) };
}
```

Run it once, at build time or in a console, and write its output into the tokens. It is not shipped to the page.

- No bounce, a duration of 0.4: the spring's run is 588 ms and its easing is `linear(0, 0.034, 0.114, 0.215, 0.321, 0.423, 0.516, 0.599, 0.671, 0.732, 0.783, 0.825, 0.86, 0.888, 0.911, 0.93, 0.944, 0.956, 0.966, 0.973, 0.979, 0.983, 0.987, 0.99, 0.992, 0.994, 0.995, 0.996, 0.997, 0.998, 0.998, 0.999, 1)`.
- A bounce of 0.2, a duration of 0.5: the spring's run is 738 ms, it passes its target by a hundredth and a half of the travel, and its easing is `linear(0, 0.036, 0.123, 0.236, 0.358, 0.478, 0.588, 0.685, 0.767, 0.834, 0.887, 0.928, 0.959, 0.981, 0.996, 1.006, 1.011, 1.014, 1.015, 1.015, 1.013, 1.012, 1.01, 1.008, 1.006, 1.005, 1.004, 1.003, 1.002, 1.001, 1.001, 1, 1)`.

In the stylesheet the spring stands behind a curve every browser reads:

```css
:root {
  --spring: var(--ease-enter);
  --spring-time: var(--time-occasional);
}
@supports (transition-timing-function: linear(0, 1)) {
  :root {
    --spring: var(--spring-stops, var(--ease-enter));
    --spring-time: var(--spring-run, var(--time-occasional));
  }
}
```

`--spring-stops` and `--spring-run` are the two outputs, set in the project's tokens; until they are, the curve and the length before them stand. A bounce under nothing is read as none, and a bounce near one makes a run many times the duration: keep it at or under the thesis's figure. The run passes the standard's limit for a literal, so the thesis names the spring and the value lives in a token.

A `linear()` spring is for a move that nothing interrupts. A CSS transition turned round in flight starts again with no speed, so a thing that is dragged, or moved again before it rests, takes a spring computed in script, frame by frame, from where it is and how fast it goes.

### 3. A move between two layouts

The element is somewhere, the page changes, and the element is somewhere else. The move reads where the element is on screen, lets the change happen, reads where it now is, and plays the difference back to nothing. A move still running is taken from where it stands on screen, and never from where it began.

```js
const flipRunning = new WeakMap();

function flip(elements, change, { duration = 300, easing = "cubic-bezier(0.16, 1, 0.3, 1)" } = {}) {
  const list = [...elements];
  // First: each element's place on screen now, a move in flight included.
  const first = list.map((element) => element.getBoundingClientRect());
  for (const element of list) {
    flipRunning.get(element)?.cancel();
    flipRunning.delete(element);
  }
  change();
  // Under reduced motion the change is the whole of it.
  if (reducedMotion.on) return [];
  const moves = [];
  list.forEach((element, i) => {
    // Last: its place after the change, with no transform on it.
    const last = element.getBoundingClientRect();
    // An element with no box before or after has no place to move from or to: it takes no move.
    if (!first[i].width || !first[i].height || !last.width || !last.height) return;
    const dx = first[i].left - last.left;
    const dy = first[i].top - last.top;
    const sx = first[i].width / last.width;
    const sy = first[i].height / last.height;
    if (!dx && !dy && sx === 1 && sy === 1) return;
    const move = element.animate(
      [
        { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transformOrigin: "0 0", transform: "none" },
      ],
      { duration, easing },
    );
    flipRunning.set(element, move);
    const forget = () => {
      if (flipRunning.get(element) === move) flipRunning.delete(element);
    };
    move.finished.then(forget, forget);
    moves.push(move);
  });
  return moves;
}
```

`change` is a function that makes the change at once: a class toggled, an item moved in the list, a filter applied. `reducedMotion` is the object of piece 10, and this piece needs it on the page. What the function does not do, each a thing to know before it is used:

- An element that had no box before the change, or has none after it, takes no move: it appears or goes by the project's own entrance or exit.
- An element whose size changes is scaled from its top left corner, and everything inside it is stretched for the length of the move, its text and its corners too. Pass elements whose size stays, and give a change of size to the project's own transition.
- The element carries no transform of its own: the move replaces it while it runs. Move a wrapper where the element has one.
- A move cancelled by a later one rejects its `finished` promise: a caller that waits on it catches that.

### 4. Feedback on a control

A press answers at once and a hover only where a pointer can hover. On a touch screen a hover rule sticks after the tap, so it stands inside the hover query.

```css
.control {
  transition:
    transform var(--time-feedback) var(--ease-enter),
    background-color var(--time-feedback) var(--ease-hover);
}
.control:active {
  transform: scale(0.97);
}
.control:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
@media (hover: hover) {
  .control:hover {
    background-color: var(--control-hover, transparent);
  }
}
@media (prefers-reduced-motion: reduce) {
  .control {
    transition: background-color var(--time-feedback) var(--ease-hover);
  }
  .control:active {
    transform: none;
  }
}
```

The focus ring does not animate: a person who moves by the keyboard must see where they are at once.

### 5. A menu that opens from its control

The menu grows from the control that opened it, and it leaves faster than it came. `@starting-style` gives the browser a state to enter from, and `transition-behavior: allow-discrete` lets `display` wait for the exit, so no script times either. Where a browser has neither, the menu opens and closes at once.

```html
<button class="control" data-menu-trigger popovertarget="menu">Options</button>
<div class="menu" id="menu" data-menu popover>
  <button class="control">Rename</button>
  <button class="control">Duplicate</button>
</div>
```

```css
@supports (transition-behavior: allow-discrete) {
  .menu {
    opacity: 0;
    transform: scale(0.95);
    transition:
      opacity 150ms var(--ease-enter),
      transform 150ms var(--ease-enter),
      overlay 150ms allow-discrete,
      display 150ms allow-discrete;
  }
  .menu:popover-open {
    opacity: 1;
    transform: none;
    transition-duration: 200ms;
  }
  @starting-style {
    .menu:popover-open {
      opacity: 0;
      transform: scale(0.95);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .menu,
    .menu:popover-open {
      transform: none;
    }
    @starting-style {
      .menu:popover-open {
        transform: none;
      }
    }
  }
}
```

```js
/** The menu's origin is its control's centre, in the menu's own box. */
function originAt(trigger, menu) {
  const from = trigger.getBoundingClientRect();
  const x = from.left + from.width / 2 - menu.offsetLeft;
  const y = from.top + from.height / 2 - menu.offsetTop;
  menu.style.transformOrigin = `${x}px ${y}px`;
}

function openFrom(trigger, menu) {
  menu.showPopover();
  originAt(trigger, menu);
}

// A menu the browser opens by its own attribute takes its origin as it opens.
for (const trigger of document.querySelectorAll("[data-menu-trigger]")) {
  const menu = document.getElementById(trigger.getAttribute("popovertarget"));
  menu?.addEventListener("toggle", (event) => {
    if (event.newState === "open") originAt(trigger, menu);
  });
}
```

The menu's place on the page is the project's: this piece gives only its motion. The origin is computed for a popover in the browser's top layer, which is placed against the viewport; a menu placed inside a positioned ancestor takes its origin from the two rectangles in place of the offsets. `openFrom` sets the origin before the first frame; a menu the browser opens by its attribute takes it one task later, so a project that sees the first frame grow from the centre calls `openFrom` from its own handler. A menu opened by a key takes no transition: the project's handler of that key adds a class that sets the menu's transition to none, since the browser's event does not say what opened it. A modal is no menu and stays centred.

### 6. The first screen's entrance, by role

One entrance, for the first screen only. Each part has a role, and the role sets when it starts and how far it travels: the title leads and travels furthest, the label follows it, the supporting line next, the action last and least. The gaps shrink, so the group reads as one gesture and not as a queue.

```html
<header class="opening">
  <p class="opening-part" data-role="label">Since 1962</p>
  <h1 class="opening-part" data-role="title">The headline of the page</h1>
  <p class="opening-part" data-role="line">The sentence that supports it.</p>
  <a class="opening-part control" data-role="action" href="#work">See the work</a>
</header>
```

```css
@keyframes opening-rise {
  from {
    opacity: 0;
    transform: translateY(var(--rise));
  }
}
@keyframes opening-fade {
  from {
    opacity: 0;
  }
}
.motion-ready .opening-part {
  animation: opening-rise var(--time-entrance) var(--ease-enter) var(--delay) both;
}
.motion-ready .opening-part[data-role="title"] {
  --delay: 0ms;
  --rise: 24px;
}
.motion-ready .opening-part[data-role="label"] {
  --delay: 110ms;
  --rise: 16px;
}
.motion-ready .opening-part[data-role="line"] {
  --delay: 190ms;
  --rise: 16px;
}
.motion-ready .opening-part[data-role="action"] {
  --delay: 240ms;
  --rise: 16px;
}
@media (prefers-reduced-motion: reduce) {
  .motion-ready .opening-part {
    animation-name: opening-fade;
    animation-delay: 0ms;
  }
}
```

```js
// The class arrives with the script, so a page whose script fails shows its first screen at once.
document.documentElement.classList.add("motion-ready");
```

The script stands in the head, before the first paint, or the first screen shows and then hides. The four starts are the skill's own choice inside the standard's total for a stagger: they are unequal on purpose. Nothing else on the first screen enters: a container whose parts enter does not enter too.

### 7. A headline that rises from behind its line

Each line of the headline is authored, and rises from behind its own baseline. The outer span clips; the room above and under it keeps an accent or a descender from being cut.

```html
<h1 class="masked">
  <span class="masked-line"><span class="masked-text">The first line</span></span>
  <span class="masked-line"><span class="masked-text">and the second.</span></span>
</h1>
```

```css
.masked-line {
  display: block;
  overflow: clip;
  padding-block: 0.12em;
  margin-block: -0.12em;
}
.masked-text {
  display: block;
}
@keyframes masked-rise {
  from {
    transform: translateY(105%);
  }
}
@keyframes masked-fade {
  from {
    opacity: 0;
  }
}
.motion-ready .masked-text {
  animation: masked-rise var(--time-entrance) var(--ease-enter) both;
}
.motion-ready .masked-line + .masked-line .masked-text {
  animation-delay: 110ms;
}
@media (prefers-reduced-motion: reduce) {
  .motion-ready .masked-text {
    animation-name: masked-fade;
    animation-delay: 0ms;
  }
}
```

The headline has two lines at most, as the library's device says; a third would rise with the second. A percentage in a translation is of the element's own size, so the line clears its mask at any size of type. The class `motion-ready` is the one piece 6's script adds, and this piece needs that script. The second line's start is the library's figure for this device, and the skill's own use of it. This piece is the page's signature or it is not used: a page has one.

### 8. A reveal on entering view, once

For the one section whose arrival the thesis names, never for every section. The element is hidden only once the script has run, and the observer lets go of it after its reveal, so scrolling back never plays it again.

```css
.reveal-armed [data-reveal] {
  opacity: 0;
  transform: translateY(16px);
}
.reveal-armed [data-reveal].is-revealed,
.reveal-armed [data-reveal]:focus-within {
  opacity: 1;
  transform: none;
  transition:
    opacity var(--time-entrance) var(--ease-enter),
    transform var(--time-entrance) var(--ease-enter);
}
@media (prefers-reduced-motion: reduce) {
  .reveal-armed [data-reveal] {
    transform: none;
  }
}
```

```js
(() => {
  if (!("IntersectionObserver" in window)) return;
  const watch = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        watch.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  // The hidden state arrives with the observer: with no script nothing is hidden.
  document.documentElement.classList.add("reveal-armed");
  for (const target of document.querySelectorAll("[data-reveal]")) watch.observe(target);
})();
```

The transition stands on the revealed state alone, so arming the page hides its targets at once and never fades them out. The script stands at the end of the body, and its targets are below the first screen: a target the first paint shows would be seen, hidden and revealed, so what the first screen holds belongs to the entrance of piece 6. A target that focus enters is shown at once. A target inside a part of the page that is never displayed stays hidden: mark none there.

### 9. A move the scroll drives

The scroll's position is the move's clock: the reader sets the pace, so the timing is linear. The browser runs it with no script. It stands inside its feature test and inside the query for a person who has not asked for less motion; anywhere else the element is still, in its final place.

```css
@keyframes drift-in {
  from {
    transform: translateY(24px);
    opacity: 0.4;
  }
}
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .drift {
      animation: drift-in linear both;
      animation-timeline: view();
      animation-range: entry 0% cover 40%;
    }
  }
}
```

The timeline is declared after the shorthand, which would reset it. A move tied to the scroll is small: the content is read while it moves.

### 10. A view transition, and reduced motion read live

The browser cross-fades two states of one page by itself, and carries an element named on both sides from its old place to its new one. The function asks whether the browser can, and whether the person asked for less motion; if either answer stops it, the update is made at once.

```js
// Reduced motion, read live: a person may change the setting with the page open.
const reducedMotion = (() => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const watchers = new Set();
  const state = {
    on: query.matches,
    // Calls `watcher` at each change, and returns the function that stops it.
    watch(watcher) {
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
  };
  query.addEventListener("change", (event) => {
    state.on = event.matches;
    for (const watcher of watchers) watcher(state.on);
  });
  return state;
})();

function swap(update) {
  if (!document.startViewTransition || reducedMotion.on) {
    update();
    return null;
  }
  return document.startViewTransition(update);
}
```

```css
::view-transition-group(*) {
  animation-duration: var(--time-occasional);
  animation-timing-function: var(--ease-enter);
}
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none;
  }
}
```

Each element carried across has a `view-transition-name` no other rendered element has: two with one name and the browser skips the whole transition. During the transition the old state is a picture and takes no input, so a view transition is never the answer to a gesture. A script that set something up for motion (a class, an observer, a loop) passes a function to `reducedMotion.watch`, undoes its work there, and keeps the function `watch` returns to stop being called.
