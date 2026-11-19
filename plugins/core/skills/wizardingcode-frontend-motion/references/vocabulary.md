# Vocabulary

A thesis names each move by a device of this list, so that a direction, a build and a review speak of the same thing, and so that two pages can be compared by what moves on them. A definition here is the crew's own sentence. A name that the trade uses is kept; where the trade has none, the name is the crew's.

42 terms: eighteen are the devices of the design library (`plugins/core/design/library/motions.json`), under the ids the library gives them; twenty-four are the moves of an interface and of a page that the library does not hold.

## The design library's devices

Each is a showpiece: a page takes one as its signature, or none. The library's own entry holds its figures and its limits.

- **`masked-headline`**: each authored line of the headline rises from behind its own baseline, the second after the first.
- **`shutter-image`**: the one great picture opens from an edge behind a clip, while the picture inside settles to rest.
- **`scaling-wordmark`**: the very large name changes size by a few hundredths as the scroll passes it.
- **`pinned-story`**: one element holds its place by the page's own sticky positioning while what belongs to it passes.
- **`index-preview`**: rows of text are the way into the work, and pointing at a row brings its picture into one fixed frame.
- **`curtain-footer`**: the page's content slides away like a sheet and uncovers the footer waiting beneath it.
- **`slow-crossfade`**: the principal picture changes quietly between a few pictures of the same framing.
- **`edge-marquee`**: one line of very large type travels sideways at a constant speed, as a band between two sections.
- **`drag-row`**: a row wider than the screen that the visitor pulls sideways, by the browser's own scrolling and snapping.
- **`colour-on-scroll`**: each chapter is a field of one palette colour, so the ground changes at a section's edge.
- **`stillness`**: no showpiece at all; the page is simply there, and its motion is exact feedback and nothing else.
- **`opening-window`**: a screen of type hands over to the one picture, which opens from a window to the full width as the scroll goes.
- **`ink-fill`**: one statement of a few lines starts pale and fills to full ink line by line as it rises through the screen.
- **`sheet-over`**: a full-bleed picture holds its place while the next chapter rises over it as an opaque sheet.
- **`sideways-gallery`**: a short set of pictures moves sideways while the vertical scroll holds the stage.
- **`pushed-line`**: one line of very large type is pushed sideways by the scroll and not by a clock.
- **`rolling-figures`**: a handful of figures at display size roll digit by digit into place, once, on entering view.
- **`carried-picture`**: the picture the visitor clicked travels into place as the next page's hero while the old page fades.

## Feedback

- **`press-feedback`**: a control shrinks by a hair under the press and returns on release, so the hand feels an answer.
- **`hover-answer`**: a control changes its ground where a pointer can hover, and nowhere else.
- **`focus-ring`**: the outline of the focused control, which appears at once and never animates.
- **`hold-to-confirm`**: a fill that advances at a constant rate while the control is held, and snaps back on an early release.
- **`number-tick`**: a figure moves from its old value to its new one on the person's own action, and never on load.

## Opening and closing

- **`origin-menu`**: a menu, a popover or a tooltip grows from the control that opened it and returns to it.
- **`centred-modal`**: a dialog enters near its full size from the centre, since no one control on the page owns it.
- **`sheet-rise`**: a sheet attached to an edge enters from that edge and leaves through it.
- **`toast-slide`**: a notice enters from the edge it lives on and leaves the same way, and a second one never restarts the first.
- **`accordion-height`**: a section opens by its measured height, kept short, since every frame of it asks the browser for layout.

## Entering

- **`role-entrance`**: the first screen's one entrance, each part starting, travelling and lasting by its role.
- **`fade`**: opacity alone, the form most moves take under reduced motion.
- **`rise`**: a short travel upward with opacity; a tell when every section repeats it unchanged.
- **`stagger`**: parts of one group starting one after another with gaps that shrink.
- **`reveal-once`**: an element that enters as it comes into view, one time, and is let go by its observer.

## Between two states

- **`cross-fade`**: the old state goes as the new arrives, in one length and one family of curve.
- **`blur-bridge`**: a light blur over a cross-fade between two similar views, which hides the moment both show.
- **`layout-move`**: an element measured before and after a change of layout and played from its old place to its new one.
- **`shared-element`**: one element shown by both states travels between them while the rest cross-fades.
- **`view-transition`**: the browser's own cross-fade of two states of a page, with named elements carried.
- **`clipped-tabs`**: a duplicate of the tab row in the active colours, clipped to the active tab, so the highlight slides.

## Following the hand or the scroll

- **`scroll-drift`**: a small move whose clock is the scroll's position, made by the browser with no script.
- **`spring-settle`**: a thing released by a gesture comes to rest as a thing with weight, from the speed the hand gave it.
- **`idle-loop`**: a small move that repeats on a long cycle, stops off screen and on a hidden tab, and can be paused.
