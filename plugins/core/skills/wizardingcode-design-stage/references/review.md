# The review

A model is looked at alone, from four sides, in plain light, before any page is built on it. What a tool makes from one picture is exact where the picture showed the object and invented where it did not, and a page built round a bad model is built twice.

## The review page

Two files that exist only in development. They are not part of the site and are never in the folder that ships. The page loads one model, puts it in the stage's own space, and draws it four times on one canvas: from the front, from the right, from the back, and from above at an angle. A grey ground, the room's reflections and one white light. It draws once and runs no loop, so it also works in a pane that is not shown. Under the views it says the model's address, its count of triangles and the turn it was shown at, and it marks the page when it is done, so that a browser the session drives knows when to capture.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Model review</title>
<style>
  html, body { margin: 0; height: 100%; background: #808080; font: 14px/1.4 system-ui, sans-serif; }
  canvas { display: block; width: 100vw; height: 100vh; }
  p { position: fixed; left: 12px; bottom: 8px; margin: 0; color: #fff; text-shadow: 0 1px 2px #000; }
</style>
</head>
<body>
<canvas></canvas>
<p data-report>loading</p>
<script type="module" src="review.js"></script>
</body>
</html>
```

```js
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// review.html?model=raw/model.glb&front=1.57 : one model, four sides, plain light.
const query = new URLSearchParams(location.search);
const address = query.get("model") || "assets/model.glb";
const front = Number(query.get("front")) || 0; // radians about the vertical axis
const report = document.querySelector("[data-report]");
const canvas = document.querySelector("canvas");

// Where the camera stands for each view; each looks at the middle of the object.
const VIEWS = [
  ["front", [0, 1, 6]],
  ["right", [6, 1, 0]],
  ["back", [0, 1, -6]],
  ["above", [3.4, 4.4, 3.4]],
];

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setScissorTest(true);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x808080);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const light = new THREE.DirectionalLight("white", 1.5);
light.position.set(2, 5, 5);
scene.add(light);

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
try {
  // A model is read from this site's own address and from nowhere else.
  if (new URL(address, location.href).origin !== location.origin) throw new Error("another host");
  const gltf = await loader.loadAsync(address);
  const object = gltf.scene;
  // The stage's own space: two units on the longest side, centred, standing on the floor. These
  // lines are the engine's `settle`: change one and change the other, or the review shows a model
  // the stage does not.
  const bounds = new THREE.Box3();
  const longest = Math.max(...bounds.setFromObject(object).getSize(new THREE.Vector3()).toArray());
  if (!(longest > 0) || !Number.isFinite(longest)) throw new Error("nothing to show");
  object.scale.multiplyScalar(2 / longest);
  const middle = bounds.setFromObject(object).getCenter(new THREE.Vector3());
  object.position.sub(new THREE.Vector3(middle.x, bounds.min.y, middle.z));
  const turntable = new THREE.Group();
  turntable.rotation.y = front;
  turntable.add(object);
  scene.add(turntable);

  let triangles = 0;
  object.traverse((part) => {
    if (!part.isMesh) return;
    const geometry = part.geometry;
    triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  });

  // One draw, a quarter of the canvas for each view, and no loop.
  const width = canvas.width / 2;
  const height = canvas.height / 2;
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.05, 60);
  VIEWS.forEach(([, eye], index) => {
    const left = (index % 2) * width;
    const bottom = index < 2 ? height : 0;
    renderer.setViewport(left, bottom, width, height);
    renderer.setScissor(left, bottom, width, height);
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.lookAt(0, 1, 0);
    renderer.render(scene, camera);
  });
  const names = VIEWS.map(([name]) => name).join(", ");
  report.textContent = `${address} · ${Math.round(triangles)} triangles · front ${front} · ${names}`;
  document.body.dataset.ready = "model";
} catch {
  report.textContent = `${address} could not be read`;
  document.body.dataset.ready = "failed";
}
```

Open it through the project's own development server, which resolves three.js as it does for the stage. With a browser the session drives: open the page, wait for `data-ready` on the body, capture, and look at the capture. With none, the user opens it and looks.

## Finding the front

The side a tool calls the front is rarely the side the page wants first. Open the review page with `front` at 0, then at a quarter turn (1.57), a half (3.14) and three quarters (4.71), and take the value whose first view shows the object's best side. Write that number into the engine's `FRONT`. The model's file is left as it came: the turn is the stage's, so the file can be made again without the page changing.

## The bar

Six points, and a model that misses one is not used. Look at the capture for each; do not take the tool's word.

1. From the front and from the side its outline is the outline of the picture it was made from, or of the client's product.
2. The part a close view will show is crisp: its edges are edges, and nothing looks melted.
3. The back and the underside could be real. A tool invents what the picture did not show, and a product does not have a back it was not built with.
4. Nothing of the ground or the background is joined to the base, and no part floats.
5. The surface is clean: not smeared, not printed twice, and with no lettering or mark nobody asked for.
6. Under the site's own light it reads as the thing itself and not as a toy of it.

Where one part came out weak and the rest holds, move the close view to a part that held and write the storyboard again to match. Where no candidate passes: one more attempt from a new source picture, at its own price and with its own yes, or the film. The test for any model: would the session open the page on it. If not, it has no place lower down either.
