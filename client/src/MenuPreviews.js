import * as THREE from 'three';
import { createAnimatedChildAvatar } from './ChildAvatar.js';
import { createWoodBoat } from './BoatModels.js';
import { createPushstick } from './Assets.js';

const PREVIEW_BG = 0xf3efe6;

function fitCamera(camera, object, margin = 1.35) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.01);
  const fov = camera.fov * (Math.PI / 180);
  const dist = ((maxDim * 0.5) / Math.tan(fov * 0.5)) * margin;
  camera.position.set(center.x + dist * 0.45, center.y + dist * 0.2, center.z + dist * 0.95);
  camera.near = dist / 100;
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
}

function makePreviewSlot(el) {
  const width = Math.max(64, Math.round(el.clientWidth) || 72);
  const height = Math.max(64, Math.round(el.clientHeight) || 72);

  el.replaceChildren();
  el.classList.add('has-model-preview');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  renderer.setClearColor(PREVIEW_BG, 1);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PREVIEW_BG);

  const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 200);
  camera.position.set(0, 1.2, 4);

  const hemi = new THREE.HemisphereLight(0xfff6e8, 0xb8c4b0, 0.95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2dd, 0.85);
  key.position.set(2.5, 4, 3);
  scene.add(key);

  const pivot = new THREE.Group();
  scene.add(pivot);

  return { el, renderer, scene, camera, pivot, spin: 0.45, disposed: false };
}

async function loadPreviewModel(slot, kind, id) {
  let object = null;
  let controller = null;

  if (kind === 'character') {
    controller = await createAnimatedChildAvatar(id);
    object = controller.group;
    controller.setMoving?.(false);
  } else if (kind === 'boat') {
    object = await createWoodBoat(id, '#c4a574', '#baffc9', 'star');
  } else if (kind === 'stick') {
    object = createPushstick(id);
    object.scale.setScalar(0.22);
    object.rotation.x = -0.35;
    object.rotation.z = 0.15;
  }

  if (!object || slot.disposed) {
    controller?.dispose?.();
    return null;
  }

  slot.pivot.add(object);
  fitCamera(slot.camera, slot.pivot, kind === 'stick' ? 1.55 : 1.4);
  return { object, controller };
}

/**
 * Mount slowly-rotating 3D model previews into intro option cards.
 * Returns a handle with stop() to dispose when leaving the lobby.
 */
export function startMenuPreviews() {
  const startScreen = document.getElementById('start-screen');
  const slots = [];
  let raf = 0;
  let last = performance.now();
  let stopped = false;

  const cards = document.querySelectorAll(
    '#character-options .option-card, #boat-options .option-card, #stick-options .option-card',
  );

  cards.forEach((card) => {
    const preview = card.querySelector('.option-preview');
    if (!preview) return;

    let kind = null;
    let id = null;
    if (card.dataset.character) {
      kind = 'character';
      id = card.dataset.character;
    } else if (card.dataset.boat) {
      kind = 'boat';
      id = card.dataset.boat;
    } else if (card.dataset.stick) {
      kind = 'stick';
      id = card.dataset.stick;
    }
    if (!kind || !id) return;

    const slot = makePreviewSlot(preview);
    slot.kind = kind;
    slot.id = id;
    slots.push(slot);

    loadPreviewModel(slot, kind, id).then((loaded) => {
      if (!loaded || slot.disposed) return;
      slot.controller = loaded.controller;
      slot.object = loaded.object;
    });
  });

  const tick = (now) => {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const menuVisible = startScreen?.classList.contains('active');
    if (menuVisible) {
      for (const slot of slots) {
        if (slot.disposed) continue;
        slot.pivot.rotation.y += slot.spin * dt;
        slot.controller?.update?.(dt, now);
        slot.renderer.render(slot.scene, slot.camera);
      }
    }

    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      for (const slot of slots) {
        slot.disposed = true;
        slot.controller?.dispose?.();
        slot.renderer.dispose();
        slot.el.replaceChildren();
        slot.el.classList.remove('has-model-preview');
      }
      slots.length = 0;
    },
  };
}
