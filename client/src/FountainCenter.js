import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PALETTE, createPaperMaterial } from './StyleSystem.js';
import { assetUrl } from './assetUrl.js';

/** Paris — Poly by Google (CC-BY) https://poly.pizza/m/0YTMlW0CUHU */
const PARIS_FOUNTAIN_URL = assetUrl('models/fountain-center.glb');
const DEFAULT_TARGET_HEIGHT = 24;

/**
 * Large centerpiece fountain with animated water jets.
 * @param {{ url?: string, targetHeight?: number, name?: string }} [opts]
 */
export function createCenterFountain(opts = {}) {
  const url = opts.url || PARIS_FOUNTAIN_URL;
  const targetHeight = opts.targetHeight ?? DEFAULT_TARGET_HEIGHT;
  // Sink so the lowest stone tier sits under the water plane
  const baseSink = opts.baseSink ?? 2.6;

  const group = new THREE.Group();
  group.name = opts.name || 'CenterFountain';
  group.position.y = -baseSink;

  const pedestal = buildProceduralFountainBase();
  group.add(pedestal);

  const jets = buildWaterJets();
  group.add(jets);
  group.userData.waterJets = jets;

  const loader = new GLTFLoader();
  loader.load(
    url,
    (gltf) => {
      try {
        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        // Mesh-only bounds so armature/empty nodes don't shrink the model
        const box = new THREE.Box3();
        model.traverse((child) => {
          if (child.isMesh) box.expandByObject(child);
        });
        if (box.isEmpty()) box.setFromObject(model);

        const size = box.getSize(new THREE.Vector3());
        const scale = targetHeight / Math.max(size.y, 0.001);
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);

        const grounded = new THREE.Box3();
        model.traverse((child) => {
          if (child.isMesh) grounded.expandByObject(child);
        });
        if (grounded.isEmpty()) grounded.setFromObject(model);
        const center = grounded.getCenter(new THREE.Vector3());
        // Center on the fountain axis so jets and stone share the same origin
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= grounded.min.y;
        model.updateMatrixWorld(true);

        const top = new THREE.Box3();
        model.traverse((child) => {
          if (child.isMesh) top.expandByObject(child);
        });
        const spoutBase = (top.max.y || targetHeight) * 0.72;
        jets.children.forEach((jet) => {
          const ratio = (jet.userData.baseY || 20) / 20;
          jet.userData.baseY = spoutBase + ratio * 10;
          jet.position.y = jet.userData.baseY;
        });

        pedestal.visible = false;
        group.add(model);
      } catch (err) {
        console.warn('Fountain model setup failed; keeping procedural:', err);
      }
    },
    undefined,
    () => console.warn('Center fountain GLB failed; keeping procedural pedestal'),
  );

  return group;
}

/** Echo Park Lake — tall water spouts only (no stone fountain body). */
export function createEchoParkFountain() {
  const group = new THREE.Group();
  group.name = 'EchoParkFountain';
  const jets = buildEchoParkJets();
  group.add(jets);
  group.userData.waterJets = jets;
  return group;
}

function buildEchoParkJets() {
  const group = new THREE.Group();
  group.name = 'EchoParkWaterJets';

  const makeMat = () =>
    new THREE.MeshStandardMaterial({
      color: 0xd2f4ff,
      emissive: 0x7ecfe8,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.6,
      roughness: 0.15,
      metalness: 0.05,
      depthWrite: false,
    });

  // Tall main column from the water surface
  const main = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.4, 48, 16), makeMat());
  main.position.y = 24;
  main.userData.baseY = 24;
  group.add(main);

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const h = 34 + (i % 3) * 5;
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.8, h, 12), makeMat());
    const radius = 4 + (i % 2) * 2.5;
    jet.position.set(Math.cos(angle) * radius, h * 0.5, Math.sin(angle) * radius);
    jet.userData.baseY = h * 0.5;
    group.add(jet);
  }

  const splash = new THREE.Mesh(
    new THREE.SphereGeometry(6.5, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
    makeMat(),
  );
  splash.position.y = 50;
  splash.userData.baseY = 50;
  group.add(splash);

  return group;
}

export function updateCenterFountain(fountainGroup, time) {
  const jets = fountainGroup?.userData?.waterJets;
  if (!jets) return;

  jets.children.forEach((jet, i) => {
    const phase = time * 2.4 + i * 0.65;
    const pulse = 0.82 + Math.sin(phase) * 0.18;
    jet.scale.y = pulse;
    jet.position.y = (jet.userData.baseY || jet.position.y) * (0.92 + Math.sin(phase) * 0.08);
    if (jet.material?.opacity != null) {
      jet.material.opacity = 0.4 + Math.sin(phase * 1.4) * 0.15;
    }
  });
}

function buildProceduralFountainBase() {
  const group = new THREE.Group();
  group.name = 'ProceduralFountainBase';

  const stone = createPaperMaterial(0xe8e0d4);
  const darkStone = createPaperMaterial(PALETTE.fountainRim);

  const tiers = [
    { r: 10, h: 1.4, y: 0.7, mat: darkStone },
    { r: 7, h: 1.6, y: 2.2, mat: stone },
    { r: 4.5, h: 1.8, y: 3.9, mat: darkStone },
    { r: 2.2, h: 6, y: 7.8, mat: stone },
  ];

  tiers.forEach((t) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r * 1.1, t.h, 24), t.mat);
    mesh.position.y = t.y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(5.5, 4.5, 1.4, 24, 1, true),
    stone,
  );
  bowl.position.y = 11.5;
  bowl.castShadow = true;
  group.add(bowl);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), darkStone);
  cap.position.y = 12.4;
  cap.castShadow = true;
  group.add(cap);

  return group;
}

function buildWaterJets() {
  const group = new THREE.Group();
  group.name = 'FountainWaterJets';

  const makeMat = () =>
    new THREE.MeshStandardMaterial({
      color: 0xc5f0ff,
      emissive: 0x6ec8e8,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.5,
      roughness: 0.2,
      metalness: 0.05,
      depthWrite: false,
    });

  const main = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.3, 16, 12), makeMat());
  main.position.y = 20;
  main.userData.baseY = 20;
  group.add(main);

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.65, 11, 8), makeMat());
    const radius = 5.5;
    jet.position.set(Math.cos(angle) * radius, 17, Math.sin(angle) * radius);
    jet.lookAt(0, 28, 0);
    jet.userData.baseY = 17;
    group.add(jet);
  }

  const splash = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    makeMat(),
  );
  splash.position.y = 28.5;
  splash.userData.baseY = 28.5;
  group.add(splash);

  return group;
}
