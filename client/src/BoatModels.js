import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  createClassicFoldBoat,
  createCutterBoat,
  createGalleonBoat,
} from './Assets.js';
import { assetUrl } from './assetUrl.js';

/**
 * Wood boat models (Poly Pizza):
 * - standard: "Sailboat" wooden — Poly by Google (CC-BY) https://poly.pizza/m/1d76pfN4Dne
 * - cutter:   "Sailboat" — Poly by Google (CC-BY) https://poly.pizza/m/6okvxHsSdzO
 * - pirate:   "Sail Boat" — Quaternius (CC0) https://poly.pizza/m/BgSZXwmm7k
 */

const BOAT_URLS = {
  standard: assetUrl('models/boat-wooden-sail.glb'),
  cutter: assetUrl('models/boat-sailboat.glb'),
  pirate: assetUrl('models/boat-quaternius-sail.glb'),
};

const TARGET_LENGTH = {
  standard: 5.5,
  cutter: 6.0,
  pirate: 6.4,
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
  model.position.y -= grounded.min.y;
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

    const mastTipY = TARGET_LENGTH[type] * 0.5;
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.35),
      new THREE.MeshStandardMaterial({
        color: flagColor,
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    flag.position.set(-0.35, mastTipY, 0);
    flag.castShadow = true;
    group.add(flag);

    return group;
  } catch (err) {
    console.warn('createWoodBoat failed, using procedural fallback:', err);
    return proceduralFallback(type, hullColor, flagColor, flagSymbol);
  }
}

Object.values(BOAT_URLS).forEach((url) => loadTemplate(url));
