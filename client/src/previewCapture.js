/**
 * Dev-only harness that re-bakes the menu option-card PNGs in
 * client/public/ui/previews. Not imported by the game — Vite leaves it out of
 * the bundle, and preview-capture.html is not a build entry.
 *
 * Usage: `npm run dev:client`, open /preview-capture.html, then save each
 * canvas (ids match the target filenames) into client/public/ui/previews/.
 *
 * Re-run whenever the sailor idle pose, outfits, or stick models change —
 * these PNGs bake in the pose from avatarIdlePose.js.
 */
import * as THREE from 'three';
import { createAnimatedChildAvatar } from './ChildAvatar.js';
import { createPushstick } from './Assets.js';
import { createWoodBoat } from './BoatModels.js';

const SIZE = 256;
const PREVIEW_BG = 0xf3efe6;

/** Framing per shot: target point, radius to fit, and camera direction. */
const SHOTS = [
  { id: 'sailor-boy', kind: 'character', model: 'boy' },
  { id: 'sailor-girl', kind: 'character', model: 'girl' },
  { id: 'stick-wooden', kind: 'stick', model: 'wooden' },
  { id: 'stick-brass', kind: 'stick', model: 'brass' },
  { id: 'stick-ribbon', kind: 'stick', model: 'ribbon' },
  { id: 'boat-standard', kind: 'boat', model: 'standard' },
  { id: 'boat-cutter', kind: 'boat', model: 'cutter' },
  { id: 'boat-pirate', kind: 'boat', model: 'pirate' },
  { id: 'boat-yacht', kind: 'boat', model: 'yacht' },
];

// Characters: head + torso, three-quarter front. These models are faceless, so a
// tight head crop just fills the card with blank skin — include the outfit.
const CHAR = { headYOffset: -0.8, radius: 2.45, dir: [0.55, 0.14, 1] };
// Sticks: the head end, slightly above so the wooden hook reads.
const STICK = { center: [0, 0, -5.45], radius: 1.5, dir: [0.65, 0.5, 0.6] };
const BOAT = { margin: 1.4, dir: [0.45, 0.2, 0.95] };

function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(2);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(PREVIEW_BG, 1);
  return renderer;
}

function makeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PREVIEW_BG);
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb8c4b0, 0.95));
  const key = new THREE.DirectionalLight(0xfff2dd, 0.85);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  return scene;
}

/** Point the camera at `center`, far enough back to fit a sphere of `radius`. */
function frameOn(camera, center, radius, dir) {
  const fov = camera.fov * (Math.PI / 180);
  const dist = (radius / Math.tan(fov * 0.5)) * 1.02;
  const offset = new THREE.Vector3(...dir).normalize().multiplyScalar(dist);
  camera.position.copy(center).add(offset);
  camera.near = Math.max(0.01, dist / 100);
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
}

function findByName(root, name) {
  let hit = null;
  root.traverse((o) => {
    if (!hit && o.name === name) hit = o;
  });
  return hit;
}

async function renderShot(shot) {
  const figure = document.createElement('figure');
  const canvas = document.createElement('canvas');
  canvas.id = shot.id;
  const caption = document.createElement('figcaption');
  caption.textContent = shot.id;
  figure.append(canvas, caption);
  document.getElementById('grid').append(figure);

  const renderer = makeRenderer(canvas);
  const scene = makeScene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);

  if (shot.kind === 'character') {
    const controller = await createAnimatedChildAvatar(shot.model);
    scene.add(controller.group);
    controller.setMoving?.(false);
    // Settle the mixer so the baked idle arm pose is applied before capture.
    for (let i = 0; i < 8; i++) controller.update?.(1 / 60);
    controller.group.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(controller.group);
    const head = findByName(controller.group, 'Head');
    const center = box.getCenter(new THREE.Vector3());
    if (head) {
      const hp = head.getWorldPosition(new THREE.Vector3());
      center.set(hp.x, hp.y + CHAR.headYOffset, hp.z);
    } else {
      center.y = box.max.y - 1.6;
    }
    frameOn(camera, center, CHAR.radius, CHAR.dir);
  } else if (shot.kind === 'boat') {
    const boat = await createWoodBoat(shot.model, '#c4a574', '#baffc9', 'star');
    scene.add(boat);
    boat.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(boat);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.01);
    const fov = camera.fov * (Math.PI / 180);
    const dist = ((maxDim * 0.5) / Math.tan(fov * 0.5)) * BOAT.margin;
    const offset = new THREE.Vector3(...BOAT.dir).normalize().multiplyScalar(dist);
    camera.position.copy(center).add(offset);
    camera.near = Math.max(0.01, dist / 100);
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
  } else {
    const stick = createPushstick(shot.model);
    scene.add(stick);
    stick.updateMatrixWorld(true);
    frameOn(camera, new THREE.Vector3(...STICK.center), STICK.radius, STICK.dir);
  }

  renderer.render(scene, camera);
  return true;
}

(async () => {
  for (const shot of SHOTS) {
    // Sequential so WebGL contexts stay well under the browser limit.
    await renderShot(shot);
  }
  window.__captureReady = true;
  document.title = 'capture ready';
})();
