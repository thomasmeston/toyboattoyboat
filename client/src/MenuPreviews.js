import * as THREE from 'three';
import { createWoodBoat } from './BoatModels.js';

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

async function loadPreviewModel(slot, id) {
  const object = await createWoodBoat(id, '#c4a574', '#baffc9', 'star');
  if (!object || slot.disposed) return null;

  slot.pivot.add(object);
  fitCamera(slot.camera, slot.pivot, 1.4);
  return object;
}

const BOAT_PREVIEW_PNG = {
  standard: '/ui/previews/boat-standard.png',
  cutter: '/ui/previews/boat-cutter.png',
  pirate: '/ui/previews/boat-pirate.png',
  yacht: '/ui/previews/boat-yacht.png',
};

function mountStaticBoatPreviews() {
  const cards = document.querySelectorAll('#boat-options .option-card');
  cards.forEach((card) => {
    const preview = card.querySelector('.option-preview');
    const id = card.dataset.boat;
    const src = BOAT_PREVIEW_PNG[id];
    if (!preview || !src) return;
    preview.classList.add('option-preview-static');
    preview.replaceChildren();
    const img = document.createElement('img');
    img.src = src;
    img.alt = card.querySelector('span')?.textContent?.trim() || 'Boat';
    img.width = 256;
    img.height = 256;
    img.decoding = 'async';
    preview.appendChild(img);
  });

  return {
    pause() {},
    resume() {},
    stop() {},
  };
}

/**
 * Mount slowly-rotating 3D boat previews into intro option cards. Sailor and
 * pushstick cards use baked PNGs (client/public/ui/previews) instead.
 * On touch/mobile, boats also use baked PNGs (avoids extra WebGL contexts).
 * pause/resume avoids recreating WebGL contexts (which blanks the main game canvas).
 */
export function startMenuPreviews({ useStaticBoats = false } = {}) {
  if (useStaticBoats) return mountStaticBoatPreviews();

  const startScreen = document.getElementById('start-screen');
  const slots = [];
  let raf = 0;
  let last = performance.now();
  let stopped = false;
  let paused = false;

  const cards = document.querySelectorAll('#boat-options .option-card');

  cards.forEach((card) => {
    const preview = card.querySelector('.option-preview');
    const id = card.dataset.boat;
    if (!preview || !id) return;

    const slot = makePreviewSlot(preview);
    slot.id = id;
    slots.push(slot);

    loadPreviewModel(slot, id).then((object) => {
      if (!object || slot.disposed) return;
      slot.object = object;
    });
  });

  const tick = (now) => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    if (paused) return;

    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const menuVisible = startScreen?.classList.contains('active');
    if (!menuVisible) return;

    for (const slot of slots) {
      if (slot.disposed) continue;
      slot.pivot.rotation.y += slot.spin * dt;
      try {
        slot.renderer.render(slot.scene, slot.camera);
      } catch {
        /* context lost — ignore until resume/reload */
      }
    }
  };
  raf = requestAnimationFrame(tick);

  return {
    pause() {
      paused = true;
    },
    resume() {
      if (stopped) return;
      paused = false;
      last = performance.now();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      paused = true;
      cancelAnimationFrame(raf);
      for (const slot of slots) {
        slot.disposed = true;
        try {
          slot.renderer.forceContextLoss?.();
        } catch {
          /* ignore */
        }
        slot.renderer.dispose();
        slot.el.replaceChildren();
        slot.el.classList.remove('has-model-preview');
      }
      slots.length = 0;
    },
  };
}
