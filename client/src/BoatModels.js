import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  createClassicFoldBoat,
  createCutterBoat,
  createGalleonBoat,
  createFlagSymbolTexture,
} from './Assets.js';
import { assetUrl } from './assetUrl.js';

/**
 * Meshy wood toy boats (from refs in public/models/refs/boats/):
 * - standard: simple wood sail (red main + blue jib)
 * - cutter:   single-sail minimalist
 * - pirate:   two-mast schooner
 * - yacht:    DEE red/white variation
 */

const BOAT_URLS = {
  standard: assetUrl('models/boat-simple-wood.glb'),
  cutter: assetUrl('models/boat-single-sail.glb'),
  pirate: assetUrl('models/boat-schooner.glb'),
  yacht: assetUrl('models/boat-dee-yacht.glb'),
};

const TARGET_LENGTH = {
  standard: 5.5,
  cutter: 5.2,
  pirate: 6.6,
  yacht: 5.8,
};

/** Extra sink after grounding (keel below water plane). Positive = lower hull into water. */
const WATERLINE_SINK = {
  standard: 1.15, // bulb keel sits below waterline
  cutter: 0.2,
  pirate: 0.05, // schooner — was sitting too deep
  yacht: 0.55, // DEE yacht — nudge hull into the water
};

const cache = new Map();

function loadTemplate(url) {
  if (cache.has(url)) return cache.get(url);

  const promise = new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        console.warn('Boat model failed to load:', url, err);
        resolve(null);
      },
    );
  });

  cache.set(url, promise);
  return promise;
}

function meshBounds(root) {
  const box = new THREE.Box3();
  let found = false;
  root.traverse((child) => {
    if (child.isMesh) {
      box.expandByObject(child);
      found = true;
    }
  });
  if (!found) box.setFromObject(root);
  return box;
}

function normalizeBoat(model, boatType) {
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const box = meshBounds(model);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.z, 0.001);
  model.scale.setScalar(TARGET_LENGTH[boatType] / longest);
  model.updateMatrixWorld(true);

  const grounded = meshBounds(model);
  const center = grounded.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  // Ground to mesh bottom, then sink so the hull (not keel tip) meets the water
  model.position.y -= grounded.min.y + (WATERLINE_SINK[boatType] ?? 0);
  return model;
}

function tintWoodHull(root, hullColor) {
  const tint = new THREE.Color(hullColor);
  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    try {
      const isArray = Array.isArray(child.material);
      const mats = isArray ? child.material : [child.material];
      const nextMats = mats.map((mat) => {
        if (!mat?.color) return mat;
        const next = mat.clone();
        next.color.lerp(tint, 0.4);
        if ('roughness' in next) next.roughness = Math.max(0.65, next.roughness ?? 0.8);
        if ('metalness' in next) next.metalness = 0.04;
        return next;
      });
      child.material = isArray ? nextMats : nextMats[0];
    } catch (_) {
      /* keep original material */
    }
  });
}

function proceduralFallback(boatType, hullColor, flagColor, flagSymbol) {
  if (boatType === 'cutter') return createCutterBoat(hullColor, flagColor, flagSymbol);
  if (boatType === 'pirate') return createGalleonBoat(hullColor, flagColor, flagSymbol);
  return createClassicFoldBoat(hullColor, flagColor, flagSymbol);
}

/**
 * Async factory for wood boat meshes. Falls back to procedural if GLB fails.
 */
export async function createWoodBoat(boatType, hullColor, flagColor, flagSymbol = 'star') {
  const type = BOAT_URLS[boatType] ? boatType : 'standard';

  try {
    const template = await loadTemplate(BOAT_URLS[type]);
    if (!template) {
      return proceduralFallback(type, hullColor, flagColor, flagSymbol);
    }

    const group = new THREE.Group();
    group.name = `WoodBoat_${type}`;

    const model = template.clone(true);
    normalizeBoat(model, type);
    tintWoodHull(model, hullColor);
    group.add(model);

    const mastTipY = TARGET_LENGTH[type] * 0.55;
    const flagPivot = new THREE.Group();
    flagPivot.name = 'BoatFlag';
    flagPivot.position.set(0.05, mastTipY, 0);
    const flagMap = createFlagSymbolTexture(flagColor, flagSymbol, 128);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.35),
      new THREE.MeshStandardMaterial({
        map: flagMap,
        color: 0xffffff,
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    // Hoist at pivot; cloth extends in +X so local yaw can stream downwind
    flag.position.set(0.275, 0, 0);
    flag.castShadow = true;
    flagPivot.add(flag);
    group.add(flagPivot);
    group.userData.boatFlag = flagPivot;

    return group;
  } catch (err) {
    console.warn('createWoodBoat failed, using procedural fallback:', err);
    return proceduralFallback(type, hullColor, flagColor, flagSymbol);
  }
}

Object.values(BOAT_URLS).forEach((url) => loadTemplate(url));
