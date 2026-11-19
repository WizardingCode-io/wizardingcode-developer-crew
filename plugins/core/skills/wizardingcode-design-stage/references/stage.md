# The stage

How the object stands behind the page, how the scroll moves the camera round it, what a phone gets, and how the session tests its own build. The code was written against three.js 0.187.0 and run in a browser on that release. three.js changes with most releases: before using this code on a later one, read its migration guide from that release on. Every number is a starting point, tuned by looking at the page.

## The layers

The stage is fixed and fills the viewport; the page scrolls above it. From the back: the poster, a plain image that is there at once and stays if anything fails; the canvas, hidden until the model is in the scene and one frame is drawn; a thin line that shows the model arriving. The story is a section in the normal flow with one block of words for each beat. The page proper begins after it, opaque, and covers the stage.

```html
<div class="stage" data-stage aria-hidden="true">
  <picture>
    <source media="(orientation: portrait)" srcset="assets/stage-poster-portrait.jpg">
    <img class="stage-still" src="assets/stage-poster.jpg" alt="" fetchpriority="high">
  </picture>
  <canvas class="stage-canvas"></canvas>
  <div class="stage-load"></div>
</div>
<main>
  <section class="story" data-story>
    <div class="beat"><div class="beat-scrim"></div><div class="beat-words"><h1>The first words</h1></div></div>
    <div class="beat"><div class="beat-scrim"></div><div class="beat-words"><p>The detail</p></div></div>
    <div class="beat"><div class="beat-scrim"></div><div class="beat-words"><p>The profile</p></div></div>
    <div class="beat"><div class="beat-scrim"></div><div class="beat-words"><p>From above</p></div></div>
    <div class="beat"><div class="beat-scrim"></div><div class="beat-words"><p>The arrival</p><a class="button" href="#start">The one action</a></div></div>
  </section>
  <section class="cover" data-cover id="start"><h2>The page proper</h2></section>
</main>
```

The stage is decoration: it is hidden from assistive technology and takes no pointer. Every word is HTML, in the order a reader meets it, and reachable by keyboard with no script.

The base CSS. The page as it stands with no script is the still: the poster behind the story, every beat in the flow at its own height. The stage is what the loader adds when it arms, by one class on the page's root, `stage-armed`. So a script that fails, is blocked or has not run yet leaves a whole page.

```css
/* The still: with no script, under the five conditions, and until the loader arms. */
.stage { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
.stage-still, .stage-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.stage-still { object-fit: cover; }
.stage-canvas { display: none; }
.stage-load { position: absolute; left: 0; bottom: 0; width: 100%; height: 2px; display: none;
  background: var(--accent); transform-origin: left; transform: scaleX(var(--load, 0)); }
.story, .cover { position: relative; z-index: 1; }
.beat { position: relative; box-sizing: border-box; display: grid; align-content: center; padding: 12vh 6vw; }
.beat-scrim { position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse 34% 46% at 17% 50%, rgb(8 7 6 / 0.62) 0%, rgb(8 7 6 / 0.36) 55%, rgb(8 7 6 / 0) 80%); }
.beat-words { position: relative; max-width: 30rem;
  text-shadow: 0 1px 2px rgb(8 7 6 / 0.95), 0 3px 12px rgb(8 7 6 / 0.75); }
.beat-words .button { text-shadow: none; }
.cover { box-sizing: border-box; min-height: 100svh; padding: 12vh 6vw; background: var(--bg); }

/* The stage: set by the loader when it arms, and by nothing else. */
.stage-armed .beat { min-height: 100svh; }
.stage-armed .stage-canvas { display: block; opacity: 0; transition: opacity 0.8s ease; }
.stage-armed .stage-load { display: block; }
.stage-armed.stage-ready .stage-canvas { opacity: 1; }
.stage-armed.stage-ready .stage-load,
.stage-armed.stage-failed .stage-load,
.stage-armed.stage-failed .stage-canvas { display: none; }
```

`stage-armed` gives each beat a viewport of height, so the story is as many viewports tall as it has beats. `stage-ready` shows the canvas over the poster. `stage-failed` leaves the poster. The page's tokens `--bg` and `--accent` are read by the CSS and by the engine. Keep these rules in this order, the still first.

## The loader

A plain script element after the markup, not a module and not deferred. It decides between the stage and the still, and asks for the engine only when it has decided for the stage.

```js
(() => {
"use strict";
const ENGINE = "./stage.js";
const STILL = [
  "(max-width: 720px)",
  "(orientation: portrait) and (max-width: 1024px)",
  "(orientation: portrait) and (pointer: coarse)",
  "(orientation: landscape) and (pointer: coarse) and (max-height: 560px)",
  "(prefers-reduced-motion: reduce)",
];

const page = document.documentElement; // the classes go here: the story and the stage both read them
const root = document.querySelector("[data-stage]");
let engine = null; // the promise of the running stage, once it has been asked for

// The same five conditions as the CSS, heard while the page is open. Under any of them nothing of
// the stage is asked for: the import stands inside the path taken only when none holds.
const conditions = STILL.map((query) => window.matchMedia(query));
function decide() {
  const still = conditions.some((condition) => condition.matches);
  page.classList.toggle("stage-armed", !still);
  if (still) {
    engine?.then((stage) => stage?.rest());
    return;
  }
  engine ??= import(ENGINE)
    .then((module) => module.start(root, page))
    .catch(() => {
      page.classList.add("stage-failed"); // the poster carries the page
      return null;
    });
  engine.then((stage) => stage?.wake());
}
for (const condition of conditions) condition.addEventListener("change", decide);
decide();
})();
```

## The engine

One module, `stage.js`, in the site's own folder. It imports three.js by its bare name, which the project's bundler resolves. It loads nothing from another host. The loader's address of the engine and the engine's address of the model are read against the page's own address: on a page that is not at the site's root, write both from the root.

```js
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL = "assets/model.glb";
const MAX_BYTES = 6 * 1024 * 1024; // a larger model is not loaded: the poster stands
const FRONT = 0; // the turn, in radians, that puts the object's best side forward: found on the review page
const EASE = 0.12; // the share of the gap closed in one frame at 60 frames a second
const RATIO = 1.75; // the most device pixels drawn for one CSS pixel
const SLOW = 24; // milliseconds a frame: slower than this over 60 frames, and fewer pixels are drawn

// One beat for each block of the story. Written for an object two units on its longest side, standing
// on the floor at the centre: where the camera stands, the point it looks at, and how far the object
// has turned. A look-at point to one side puts the object on the other, clear of the words.
const BEATS = [
  { eye: [1.5, 1.2, 5.4], look: [-0.9, 0.9, 0], turn: 0 },
  { eye: [0.8, 1.3, 1.9], look: [-0.2, 1.1, 0], turn: 1.3 },
  { eye: [0.2, 1.0, 5.2], look: [-0.9, 0.9, 0], turn: 2.8 },
  { eye: [0.6, 4.4, 2.5], look: [-0.5, 0.8, 0], turn: 4.4 },
  { eye: [1.2, 1.1, 5.0], look: [-0.9, 0.9, 0], turn: 6.283 },
];

const clamp = (value) => Math.min(1, Math.max(0, value));
const mix = (a, b, t) => a + (b - a) * t;

// The object in a known space, whatever its file's units: two units on its longest side, centred,
// standing on the floor. Every beat is written for that space.
function settle(object) {
  const bounds = new THREE.Box3();
  const longest = Math.max(...bounds.setFromObject(object).getSize(new THREE.Vector3()).toArray());
  // A file with nothing to show has no size: it is no model, and the poster stands.
  if (!(longest > 0) || !Number.isFinite(longest)) throw new Error("no model");
  object.scale.multiplyScalar(2 / longest);
  const middle = bounds.setFromObject(object).getCenter(new THREE.Vector3());
  object.position.sub(new THREE.Vector3(middle.x, bounds.min.y, middle.z));
}

// The model's own index, read before the model is parsed. A file whose index names a buffer or a
// picture by an address is not whole in itself: parsing it would send the visitor's browser to
// fetch from wherever the file says. Such a file is refused, and so is one whose index cannot be
// read. Any address refuses it, one that carries its data in itself among them: a binary file
// holds its data in its own second part, and one rule with no exception is the rule that holds.
function selfContained(buffer) {
  try {
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67) return false; // not a binary glTF
    if (view.getUint32(16, true) !== 0x4e4f534a) return false; // its first part is not the index
    const text = new TextDecoder().decode(new Uint8Array(buffer, 20, view.getUint32(12, true)));
    const index = JSON.parse(text);
    return [...(index.buffers ?? []), ...(index.images ?? [])].every((entry) => entry.uri === undefined);
  } catch {
    return false; // too short, cut off, or no index a reader can read
  }
}

export function start(root, page) {
  const canvas = root.querySelector("canvas");
  const story = document.querySelector("[data-story]");
  const cover = document.querySelector("[data-cover]");
  const dev = root.hasAttribute("data-stage-dev"); // the session's self-test; never on the built site
  const tokens = getComputedStyle(page);
  const token = (name, fallback) => tokens.getPropertyValue(name).trim() || fallback;

  // A machine that cannot make the context throws here, and the loader shows the poster.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  let ratio = Math.min(window.devicePixelRatio || 1, RATIO);
  renderer.setPixelRatio(ratio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // The scene takes the page's ground and accent, so the two cannot drift apart.
  const scene = new THREE.Scene();
  const ground = new THREE.Color(token("--bg", "#14110f"));
  scene.background = ground;
  scene.fog = new THREE.FogExp2(ground, 0.07); // the floor has no edge
  const room = new THREE.PMREMGenerator(renderer);
  scene.environment = room.fromScene(new RoomEnvironment(), 0.04).texture; // reflections with no file
  scene.environmentIntensity = 0.55;
  // One light that casts the one shadow, and one from behind in the page's accent.
  const sun = new THREE.DirectionalLight("white", 1.6);
  sun.position.set(2, 5, 5);
  sun.shadow.mapSize.setScalar(2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
  sun.castShadow = true;
  const edge = new THREE.SpotLight(token("--accent", "#e8a13a"), 40);
  edge.position.set(-3, 3, -4);
  edge.target.position.set(0, 1, 0);
  // A flat bed under the object that shows its shadow and nothing else.
  const bed = new THREE.Mesh(new THREE.CircleGeometry(20, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
  bed.rotateX(-Math.PI / 2);
  bed.receiveShadow = true;
  const turntable = new THREE.Group();
  scene.add(sun, edge, edge.target, bed, turntable);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);

  let model = null;
  let awake = false; // false under a still condition
  let failed = false;
  let covered = false;
  let running = false;
  let goal = 0;
  let at = 0;
  let before = 0;
  let spent = 0;
  let counted = 0;
  let drawn = 0;
  let painted = "";

  function size() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false); // the CSS sizes the canvas
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  // How far the visitor is through the story, from 0 to 1.
  function progress() {
    const box = story.getBoundingClientRect();
    const span = box.height - window.innerHeight;
    return span > 0 ? clamp(-box.top / span) : 0;
  }

  // The camera and the turn at a position: the two beats on either side, blended with an ease that
  // rests on each beat, where its words are.
  function place(p) {
    const along = p * (BEATS.length - 1);
    const index = Math.min(Math.floor(along), BEATS.length - 2);
    const local = along - index;
    const t = local * local * (3 - 2 * local);
    const a = BEATS[index];
    const b = BEATS[index + 1];
    // A tall window: the object is framed in the middle and from further away.
    const tall = camera.aspect < 1;
    let back = 1;
    if (camera.aspect < 1.3) back = 1.25;
    if (tall) back = 1.6;
    const look = [0, 1, 2].map((axis) => mix(a.look[axis], b.look[axis], t));
    const reach = [0, 1, 2].map((axis) => mix(a.eye[axis] - a.look[axis], b.eye[axis] - b.look[axis], t));
    if (tall) look[0] = 0;
    camera.position.set(look[0] + reach[0] * back, look[1] + reach[1] * back, look[2] + reach[2] * back);
    camera.lookAt(look[0], look[1], look[2]);
    turntable.rotation.y = FRONT + mix(a.turn, b.turn, t);
  }

  // What was painted goes on the stage's element, rounded, when it changes: a test cannot see
  // inside a canvas. The camera's position and the object's turn, four numbers.
  function draw() {
    renderer.render(scene, camera);
    const round = (value) => Math.round(value * 100) / 100;
    const now = [...camera.position.toArray(), turntable.rotation.y].map(round).join(" ");
    if (now !== painted) {
      painted = now;
      root.dataset.stageState = now;
    }
    if (dev) {
      drawn += 1;
      root.dataset.stageDraws = String(drawn);
    }
  }

  // The position on screen moves toward the scroll's by a share that is the same at every frame
  // rate. When it has arrived the loop is taken off: a stage nobody is moving draws nothing.
  function tick(now) {
    const elapsed = Math.min(100, now - (before || now));
    before = now;
    at += (goal - at) * (1 - (1 - EASE) ** (elapsed / 16.667));
    const arrived = Math.abs(goal - at) < 0.0005;
    if (arrived) at = goal;
    place(at);
    draw();
    weigh(elapsed);
    if (arrived) park();
  }

  // A machine that cannot keep up draws fewer pixels, a quarter at a time, and never more again.
  function weigh(elapsed) {
    if (!elapsed) return;
    spent += elapsed;
    counted += 1;
    if (counted < 60) return;
    if (spent / counted > SLOW && ratio > 1) {
      ratio = Math.max(1, ratio - 0.25);
      renderer.setPixelRatio(ratio);
      size();
    }
    spent = 0;
    counted = 0;
  }

  function run() {
    if (running || !awake || failed || covered || !model || document.hidden) return;
    running = true;
    renderer.setAnimationLoop(tick);
  }

  // The loop taken off. A stage nobody is moving draws nothing.
  function park() {
    renderer.setAnimationLoop(null);
    running = false;
    before = 0;
  }

  // The stage rests once the page proper covers it.
  function onScroll() {
    if (!awake || failed) return; // under a still and after a failure a scroll costs nothing
    goal = progress();
    const top = cover ? cover.getBoundingClientRect().top : 1;
    covered = top <= 0;
    if (covered) park();
    else run();
  }

  // Every failure ends here: the poster carries the page, and the stage lets go of what it held.
  function fail(cause) {
    if (failed) return;
    failed = true;
    park();
    page.classList.add("stage-failed");
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    room.dispose();
    renderer.dispose();
    if (dev) console.warn("stage:", cause); // the session sees why; a visitor's console stays quiet
  }

  // The model whole, from the site's own folder, with its progress on the load line.
  async function load() {
    try {
      const response = await fetch(MODEL);
      const length = Number(response.headers.get("Content-Length")) || 0;
      if (!response.ok || length > MAX_BYTES) throw new Error("no model");
      const reader = response.body.getReader();
      const parts = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        bytes += value.length;
        if (bytes > MAX_BYTES) throw new Error("no model");
        // A host that compresses the file reports the smaller length: the share is held to one.
        if (length) root.style.setProperty("--load", String(Math.round(clamp(bytes / length) * 100) / 100));
      }
      const buffer = await new Blob(parts).arrayBuffer();
      if (!selfContained(buffer)) throw new Error("no model");
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder); // the decoder ships inside three.js
      const gltf = await loader.parseAsync(buffer, "");
      if (failed) return;
      settle(gltf.scene);
      gltf.scene.traverse((part) => {
        if (part.isMesh) part.castShadow = true;
      });
      turntable.add(gltf.scene);
      model = gltf.scene;
      at = goal = progress();
      place(at);
      draw(); // one frame before the canvas is shown
      page.classList.add("stage-ready");
      onScroll();
    } catch (cause) {
      fail(cause);
    }
  }

  // A lost context is not asked for again: the poster stands for the rest of the visit.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    fail("the context was lost");
  });
  function onVisibility() {
    if (document.hidden) park();
    else onScroll();
  }
  function onResize() {
    if (!awake || failed) return;
    size();
    if (model) {
      place(at);
      draw();
    }
    onScroll();
  }
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  // The story has one block for each beat. A count that differs is said to the session.
  const blocks = story.querySelectorAll(".beat").length;
  if (dev && blocks !== BEATS.length) console.warn(`stage: ${BEATS.length} beats for ${blocks} blocks of the story`);

  size();
  load();
  return {
    // Under a still condition the stage draws nothing and keeps what it loaded.
    rest() {
      awake = false;
      park();
    },
    wake() {
      awake = true;
      size();
      if (model && !failed) {
        at = goal = progress();
        place(at);
        draw();
      }
      onScroll();
    },
  };
}
```

What each part is for:

- **The known space.** A model arrives in its maker's units and with its origin anywhere. Settled, it is two units on its longest side, centred, standing on the floor, so the beats are written once and hold for any model.
- **The model's index.** A model file can name its pictures and buffers by address. One that does would make every visitor's browser ask whatever host the file names. The engine reads the index first and refuses such a file to the poster, as it refuses a file above `MAX_BYTES` and an address that answers with an error.
- **The eased position.** The scroll's position written straight into the camera makes it jerk with every notch of a wheel. The position on screen closes a share of the gap each frame, and the exponent makes that share the same on a screen of 60 and of 120 frames a second.
- **Moving and resting.** The loop is on only while the position on screen is still closing on the scroll's. It is taken off on arrival, when the page proper covers the stage, on a hidden tab, under a still condition and after a failure. A scene at rest draws nothing, and after a failure the stage stops listening to the page and gives back what it held.
- **Why it failed.** Every failure looks the same to a visitor: the poster. On a stage whose element carries `data-stage-dev` the engine says the cause in the console, and says a count of beats that differs from the story's blocks.
- **Fewer pixels.** The pixel ratio is capped at `RATIO`. A machine that averages more than `SLOW` milliseconds a frame over 60 frames draws a quarter less, down to one device pixel for one CSS pixel. No test of the crew holds this step: it was not seen to happen.
- **A lost context.** The browser can take the context away, when the graphics memory runs out among other reasons. The engine does not ask for it again: a scene that comes back in the middle of a scroll flashes. The poster stands for the rest of the visit.
- **What was painted.** `data-stage-state` on the stage's element holds the camera's position and the object's turn, rounded to two decimals, written when it changes. The self-test reads it. `data-stage-draws`, the count of frames drawn, is written only where the element carries `data-stage-dev`, which a built site never does.

For a site with no bundler, copy three.js's `build` and `examples/jsm` folders into the site's own folder and name them in an import map in the head, before any module:

```html
<script type="importmap">
{ "imports": { "three": "./vendor/three/build/three.module.js", "three/addons/": "./vendor/three/examples/jsm/" } }
</script>
```

## The beats

A beat is three things: where the camera stands, the point it looks at, and how far the object has turned about its vertical axis. One beat for each block of the story; the engine blends the two beats on either side of the scroll's position.

- Write the beats in the known space. The camera's field of view is 30 degrees; from five to six units away the whole object stands in frame with margin, and from under two it is a close view of one part.
- Put the object on one side and the words on the other by moving the look-at point: looking to the left of the object puts it on the right.
- Turn the object and move the camera little. A camera carried from one side of the object to the other in a straight line passes through it. Once round across the whole story reads as a walk round the object. No beat should take more than about two radians of that turn: more, and the eye loses the object as it spins.
- A close view shows a solid part: a hinge, a dial, a join. Not a thin wire, a spoke or glass, which a generated model draws badly.
- Beats of equal height should cover like distances. A beat whose camera travels far while its neighbours barely move reads as a lurch: give it two blocks, or shorten its move.
- A beat where nothing moves and the words do not change is scroll with nothing in it. Cut it.
- In a window taller than it is wide the engine frames the object in the middle and from further away; the words stand above or below it.

Check every beat in a browser the session can drive, at 1440 by 900 and at 1280 by 800: scroll to the beat, wait for the stage to rest, capture, and look. The object stands whole in the frame, with air round it, and no word lies across it; the close view shows the part it was written for; the last beat is a composition a visitor can stop on. Change the numbers and capture again.

## Light

- Reflections come from three.js's room environment, which is inside the library: no file to download and no licence to record. Its look has changed between releases, so its intensity is tuned on the release in use.
- One key light casts the one shadow. One rim light, in the page's accent, from behind. The floor shows the shadow and nothing else, and fog in the page's ground colour hides where the floor ends. The scene's ground is the page's ground, never pure black or pure white.
- The scene reads `--bg` and `--accent` from the page, so a change of the tokens changes both.

## Words over a live scene

A film has a set of frames, so its worst frame can be found. A stage has none: what stands behind a line depends on the scroll. The worst case is built by hand.

- Each block of words has a scrim of its own, a sibling of the words and not drawn by them, dark behind the block and gone before it reaches the object. Never one dark layer over the whole scene.
- A shadow on the text, and none on a button's label.
- The measure is the crew's standard: text over the scene holds 4.5:1, or 3:1 for large text. For each beat, take the scroll to the three places where the object comes nearest the words (the beat's start, its middle and its end), make the glyphs transparent and take their shadow off, capture, and read the pixels of the text's box. Deepen that block's scrim until the worst of the three holds. Do not hide the block itself.
- A blur behind text over a canvas is drawn again for every frame the canvas draws. Keep it to a small label.

## The still

For some visitors there is no stage: the poster behind the story, with every beat's words in the flow. It is a layout of its own, and it is the page's default: the loader arms the stage only when none of the five conditions holds, and hears them change while the page is open. The same five strings stand in the loader and in the CSS, where they keep the canvas hidden whatever class is set. They are the film skill's, word for word, so a page with a film and a stage has one rule.

```css
@media (max-width: 720px),
  (orientation: portrait) and (max-width: 1024px),
  (orientation: portrait) and (pointer: coarse),
  (orientation: landscape) and (pointer: coarse) and (max-height: 560px),
  (prefers-reduced-motion: reduce) {
  .stage-canvas, .stage-load { display: none !important; }
}
```

Under any of the five nothing of the stage is asked for: not the engine, not three.js, not the model. A stage on a phone is a decision made on purpose, and only where the model is small, the beats are written again for a tall screen, and the user has seen it on a real phone.

The posters are captures of the finished scene, never another picture: one at 1920 pixels wide for a wide screen and one for a tall one, each at the beat that reads best as a still. Capture them with the browser the session drives, from the stage at rest. A poster that does not match the scene makes the stage's arrival a jump.

## What is not given

Each of these is a decision with a cost, and none has code here.

- **A living element**: falling particles, an object that turns slowly when nobody scrolls. It keeps the loop on for as long as the stage is visible, where a stage without one rests between scrolls. Left out under reduced motion.
- **A section where the visitor turns the object.** It owes a keyboard equal: two buttons, or arrow keys on a control with a role and a name. A drag layer lets a vertical swipe scroll the page. No control that takes the wheel or the vertical swipe.
- **Light modes** the visitor switches: eased, never snapped, with the pressed state said to assistive technology.
- **A second, transparent canvas of atmosphere over a film**, with no model, no lights and no shadow.
- **Post-processing.** It holds full-size buffers in graphics memory.

A model over a film in one view asks for matched light, matched perspective and a shadow that lands on something. It is refused, but over an abstract ground with no floor and no horizon.

## The self-test

Run by the session, before the user sees the page. Prove each; assume none.

1. Capture every beat at 1440 by 900 and at 1280 by 800, with the stage at rest, and look at each.
2. Read `data-stage-state` at each beat: it holds that beat's camera position and turn. Scroll back to the top: it holds the first beat's.
3. Compare the captures of two beats: they differ. A canvas that is blank or stuck on one frame passes every counter.
4. With `data-stage-dev` on the stage's element, read `data-stage-draws` at rest, wait, and read it again: it has not moved. Then scroll into the page proper: it does not move there either.
5. Measure each block of words against the worst of its three places: 4.5:1, or 3:1 for large text.
6. Load with scripts off: the still, every beat visible and none cut. Load with reduced motion on: the still, and no request for the engine, for three.js or for the model. Then, with the page open, switch reduced motion on, and off again.
7. Load with the model's address pointing at a missing file: `stage-failed`, the poster in the canvas's place, the page whole. Assert the model's 200 and `stage-ready` on a good load too: a poster looks exactly like a scene that is not moving.
8. Lose the context, with the browser's own extension for it or the renderer's `forceContextLoss()`: `stage-failed`.
9. Turn a tablet's width from portrait to landscape and back: the still and the stage each take over.
10. Use every button and link by keyboard, in order.
11. Try to push the page sideways: an anchor link, a narrow width.
12. Read the console at desktop and at phone width: no error, and no request to another host.
13. Read the page with the stage's element taken out: every word and the one action are there.
14. Say in the report what was not proven: the frame rate on a named machine, and anything at all on a real phone, which a session cannot drive.
