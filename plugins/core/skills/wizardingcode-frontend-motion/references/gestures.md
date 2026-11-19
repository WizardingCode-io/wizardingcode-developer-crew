# Gestures

A drag is the one move a person makes with their own hand, and the one a page most often gets wrong: the element trails the finger, a flick is ignored, a sheet on its way out cannot be caught. This reference holds the rules of a drag and one drag, whole, that a session copies.

## Before a drag is built

A drag is the last of three answers, in this order.

1. **The project's own component.** A sheet, a drawer or a carousel the project already has holds months of cases this page does not: focus kept inside, the key that closes, the page behind held still. It is used as it is.
2. **The browser's own scrolling.** A row wider than the screen is the browser's scrolling with snapping, which is the design library's `drag-row`. Nothing here is built for it.
3. **A drag written for the page**, only where neither covers the need: a card that is swiped away, a sheet of the page's own.

Whatever a drag does, a button beside it does the same. That is a norm and not a courtesy: a person who cannot drag, or does not know the element can be dragged, has the button.

## The two phases

Every drag is two things, and each fault of a drag is one of them done in the other's way.

- **While the pointer is down** the element is where the hand is. It follows one to one, with no curve, no length and no spring.
- **On release** the hand is gone and a spring finishes the move, from the place the element stands at and the speed the hand gave it. Never a keyframe animation: it would start again from its own beginning.

## While the pointer is down

- **A drag commits after a short travel.** Before it, a press may still be a tap or the start of a scroll, and nothing moves. The element then follows from the point it committed at, so it never jumps to the pointer.
- **The pointer is captured** once the drag commits, so the drag goes on once the pointer is outside the element's box.
- **The transform is written on the element itself**, at each event. Nothing is animated, and no state of a component is set.
- **One pointer.** A second finger changes nothing.
- **Past a limit, resistance.** Dragged against the way it leaves, the element gives a little and less the further it is pulled. A wall reads as a fault.
- **A control inside is not a handle.** A press that starts on a button or a link inside the element starts no drag.
- **`touch-action`** tells the browser which axis is the element's, so the page still scrolls on the other.

## On release

- **Distance or speed.** The release is projected to where it is going. The element leaves when that landing is past a share of its own size, so a short quick flick dismisses and a slow short drag does not.
- **A quick return.** A drag that does not dismiss comes back at once.
- **Bounce, here alone.** A release is the one place the skill allows a bounce, and only as its section on springs says. The drag below has none.
- **It can be caught.** A press while the element settles stops it where it is, and the drag goes on from there.
- **A cancel is a return.** When the browser cancels the pointer or the capture is lost, the element goes back to rest and the drag forgets what it held.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| The landing of a release is its place plus its speed projected with a deceleration of 0.998 | `hypothesis` | `emilkowalski/skills`, `apple-design/SKILL.md` | A practitioner's summary, MIT, of a third party's sample code and talks; the formula and the figure are the source's as they stand |
| Past its limit a drag is resisted by a band with a constant of 0.55 | `hypothesis` | `emilkowalski/skills`, `apple-design/SKILL.md` | A practitioner's summary, MIT, of a third party's sample code and talks; the formula and the figure are the source's as they stand |
| The drag below commits after 10 px, and dismisses past 0.4 of the element's size | `hypothesis` | `emilkowalski/skills`, `apple-design/SKILL.md` and `gestures/SKILL.md` | The first figure is one file's, the second the lower end of the other's range |

The two formulas and these figures were not read at their origin: they reach this skill through one practitioner's files. A project that finds them wrong for its hands changes them in the one place the code names them.

## What moves with the drag

A backdrop that fades as a sheet leaves, a page behind that grows: each is computed from the drag's progress, at the same write as the element's transform. One source means the backdrop's fade always matches how far the sheet has gone, while it is dragged, when the hand turns back and when the release is caught. A second animation beside the drag drifts from it the first time the drag is interrupted.

## The drag, whole

A drag to dismiss on one axis. It needs `reducedMotion`, the object of the recipes' piece 10, on the page before it.

```html
<div class="sheet" data-sheet role="dialog" aria-label="Details">
  <button class="control" data-sheet-close>Close</button>
  <p>What the sheet holds.</p>
</div>
```

```css
/* A sheet that leaves downward: the browser keeps the sideways pan, and the drag has the other. */
[data-sheet] {
  touch-action: pan-x;
}
[data-sheet][data-drag-state="dragging"] {
  user-select: none;
}
```

```js
function dragToDismiss(element, options = {}) {
  const { axis = "y", onDismiss, onProgress, threshold = 10, share = 0.4 } = options;
  // The source's two figures, and the skill's own two.
  const DECELERATION = 0.998;
  const RESISTANCE = 0.55;
  const SPEED_WINDOW = 100;
  const SPRING = (2 * Math.PI) / 400;

  const along = (event) => (axis === "x" ? event.clientX : event.clientY);
  const size = () => (axis === "x" ? element.offsetWidth : element.offsetHeight);
  const band = (over, length) => (over * length * RESISTANCE) / (length + RESISTANCE * Math.abs(over));
  // How far a release still travels, from its speed in pixels a millisecond.
  const carry = (speed) => (speed * 1000 * DECELERATION) / (1 - DECELERATION) / 1000;

  let pointer = null; // the id of the one pointer that drags
  let pressed = 0; // where it went down
  let origin = 0; // the pointer's place that is an offset of nothing
  let committed = false;
  let offset = 0;
  let samples = [];
  let frame = 0;

  const mark = (state) => {
    element.dataset.dragState = state;
  };
  const write = (value) => {
    offset = value;
    element.style.transform = value ? `translate${axis.toUpperCase()}(${value}px)` : "";
    onProgress?.(value / size());
  };
  const commit = (event, from) => {
    committed = true;
    origin = from;
    samples = [];
    mark("dragging");
    // A browser refuses the capture of a pointer that is no longer down: the drag goes on without.
    try {
      element.setPointerCapture(event.pointerId);
    } catch {}
  };
  const finish = (target) => {
    write(target);
    if (target === 0) return mark("rest");
    mark("dismissed");
    onDismiss?.();
  };
  // A spring with no bounce, from the offset and the speed it is given, in pixels a millisecond.
  const settle = (target, speed) => {
    cancelAnimationFrame(frame);
    if (reducedMotion.on) return finish(target);
    mark("settling");
    const from = offset - target;
    const push = speed + SPRING * from;
    let began = null;
    const step = (now) => {
      began ??= now;
      const time = now - began;
      const left = (from + push * time) * Math.exp(-SPRING * time);
      if (time > 0 && Math.abs(left) < 0.5) return finish(target);
      write(target + left);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  const forget = () => {
    pointer = null;
    committed = false;
  };

  const lost = (event) => {
    if (event.pointerId !== pointer) return;
    forget();
    settle(0, 0);
  };
  const wired = new AbortController();
  const on = (type, handler) => element.addEventListener(type, handler, { signal: wired.signal });

  on("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (element.dataset.dragState === "dismissed") return;
    const inner = event.target.closest("button, a, input, select, textarea, [data-no-drag]");
    if (inner && inner !== element) return;
    // A press takes the drag whatever came before: a pointer let go outside the element, before
    // the drag had captured it, never told the element, and must not hold the drag for good.
    const held = committed || element.dataset.dragState === "settling";
    pointer = event.pointerId;
    pressed = along(event);
    committed = false;
    if (!held) return;
    // Caught while it settles, or left where a lost pointer dropped it: it stops where it is,
    // and the drag goes on from there.
    cancelAnimationFrame(frame);
    commit(event, pressed - offset);
  });

  on("pointermove", (event) => {
    if (event.pointerId !== pointer) return;
    // No button is down: the pointer was let go where the element could not hear it.
    if (!event.buttons) return lost(event);
    if (!committed) {
      const travel = along(event) - pressed;
      if (Math.abs(travel) < threshold) return;
      commit(event, pressed + Math.sign(travel) * threshold);
    }
    const raw = along(event) - origin;
    write(raw < 0 ? band(raw, size()) : raw);
    samples = samples.filter((sample) => sample.at >= event.timeStamp - SPEED_WINDOW);
    samples.push({ at: event.timeStamp, offset });
  });

  on("pointerup", (event) => {
    if (event.pointerId !== pointer) return;
    const dragged = committed;
    forget();
    if (!dragged) return;
    // The speed of the last moments alone: a drag held still and then let go has none.
    const recent = samples.filter((sample) => sample.at >= event.timeStamp - SPEED_WINDOW);
    const first = recent[0];
    const last = recent.at(-1);
    const speed = first && last.at > first.at ? (last.offset - first.offset) / (last.at - first.at) : 0;
    const landing = offset + carry(speed);
    settle(landing > share * size() ? size() : 0, speed);
  });

  on("pointercancel", lost);
  on("lostpointercapture", lost);

  mark("rest");
  return {
    dismiss() {
      if (element.dataset.dragState === "dismissed") return;
      forget();
      settle(size(), 0);
    },
    // Takes the drag off the element: its listeners, and a drag or a settle in flight, which
    // goes back to rest at once. A dismissed element stays dismissed.
    destroy() {
      cancelAnimationFrame(frame);
      wired.abort();
      forget();
      if (element.dataset.dragState === "dismissed") return;
      write(0);
      mark("rest");
    },
  };
}
```

```js
const sheet = document.querySelector("[data-sheet]");
const drag = dragToDismiss(sheet, {
  onDismiss: () => sheet.remove(),
  onProgress: (share) => sheet.style.setProperty("--sheet-gone", share),
});
sheet.querySelector("[data-sheet-close]").addEventListener("click", drag.dismiss);
```

`axis: "x"` makes a card that leaves to the right, with `touch-action: pan-y` in its CSS. The offset is positive the way the element leaves; an element that leaves upward or to the left is the same drag with the sign of `along` turned. `data-drag-state` on the element is `rest`, `dragging`, `settling` or `dismissed`, for the page's styles and for a test. The speed is read over the last 100 ms of the drag, the skill's own figure. The settle is the spring's simplest form, no bounce and a duration of 0.4 s in the sense the skill's section on springs gives that word: the spring's run is longer, as the recipes' first output shows, and it is the pair the source's own sample gives.

## What the code does not do

- It does not trap focus, close on a key or hold the page behind still. A sheet that needs those is the project's dialog, with this drag on it.
- It has one resting place and one way out. A sheet with several heights to rest at is another piece of code.
- It does not decide what a dismissal means. `onDismiss` is where the project closes its dialog or takes the card from its list; the example removes the element.
- It moves by `transform`, so an element that carries a transform of its own is wrapped.
- It is one drag on one element. A draggable inside a draggable is not held: the outer takes the pointer and the inner goes back to rest.
- Its settle runs on animation frames, which a hidden tab does not give: a dismissal started as the tab is hidden ends, and calls `onDismiss`, when the tab is seen again.
- `onProgress` is called inside every write and must not throw: a throw during the settle leaves the element where it stood until the next press.
- The guard round the capture is silent, so a capture refused for another cause is silent too.
- `destroy()` takes the drag off an element that stays on the page, and puts back to rest an element it finds mid-way.
- Its rule for a move with no button down rests on what browsers report: a finger in contact reports a button, and a browser that did not would end every touch drag at its first move. The trial on a real phone is where that is seen.
- Its figures are for a sheet about the height of a phone's screen or less. On a much larger element the same share is a long way to pull.

## Reduced motion

Following the pointer stays: the person makes that motion, and taking it away would break the drag. What goes is what the page adds. The release sets its end at once, with no spring, and so does the button's dismissal.

## Checking a gesture

What a test of the page holds: that the drag commits past its threshold and not before, that the element follows by the pointer's own distance, that a release goes where its speed and place say, that a cancel returns it, that the button does the same, and that reduced motion sets the end at once. The crew's own row drives the drag above with a pointer whose every event carries a time the row sets, so its speeds are arithmetic.

What no test holds, and a hand on a real phone does: whether the element seems to be under the finger, whether a flick is asked for too much or too little, whether the return is quick enough to read as an answer, whether the resistance reads as a limit. A simulated touch on a desktop screen hides all four. Before a drag ships it is tried on a phone, slowly, quickly, and caught on its way out.
