import * as THREE from 'three';
import { createPaperMaterial, PALETTE, WATER_COLORS, createWaterMaterial } from '../StyleSystem.js';
import { createParkScenery, createParkTree, createParkBench, faceBenchTowardFountain } from '../Assets.js';
import { createCenterFountain } from '../FountainCenter.js';

/** Dispose geometries/materials under a root. */
export function disposeObject3D(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m?.dispose?.();
    }
  });
}

function ellipseOnRim(angle, rx, rz, pad = 0) {
  return {
    x: Math.cos(angle) * (rx + pad),
    z: Math.sin(angle) * (rz + pad),
  };
}

function createEllipseDisk(rx, rz, y, material, segments = 64) {
  const base = Math.max(rx, rz);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(base, base, 0.1, segments),
    material,
  );
  mesh.scale.set(rx / base, 1, rz / base);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

function createEllipseRingMesh(innerRx, outerRx, rzScale, material) {
  const geo = new THREE.RingGeometry(innerRx, outerRx, 48);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.scale.z = rzScale;
  mesh.position.y = 0.01;
  mesh.receiveShadow = true;
  return mesh;
}

function createDuck() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 8, 6),
    createPaperMaterial(0xd4a84b),
  );
  body.scale.set(1.3, 0.85, 1);
  body.position.y = 0.35;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 6),
    createPaperMaterial(0xe8c56a),
  );
  head.position.set(0.45, 0.7, 0);
  g.add(head);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.35, 5),
    createPaperMaterial(0xe07040),
  );
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.75, 0.65, 0);
  g.add(beak);
  g.userData.kind = 'duck';
  g.userData.phase = Math.random() * Math.PI * 2;
  g.userData.speed = 0.15 + Math.random() * 0.2;
  g.userData.orbitR = 0.55 + Math.random() * 0.25;
  return g;
}

function createLilyCluster() {
  const g = new THREE.Group();
  const padMat = createPaperMaterial(PALETTE.obstacleLily);
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1 + Math.random() * 0.6, 1.2, 0.08, 8),
      padMat,
    );
    pad.position.set(
      (Math.random() - 0.5) * 3.5,
      0.08,
      (Math.random() - 0.5) * 3.5,
    );
    pad.rotation.y = Math.random() * Math.PI;
    g.add(pad);
  }
  return g;
}

function createFishFlash() {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 6, 4),
    new THREE.MeshStandardMaterial({
      color: 0xc9a24a,
      roughness: 0.4,
      metalness: 0.2,
      transparent: true,
      opacity: 0.55,
    }),
  );
  mesh.userData.kind = 'fish';
  mesh.userData.phase = Math.random() * Math.PI * 2;
  mesh.userData.speed = 0.4 + Math.random() * 0.5;
  return mesh;
}

function createNycSkyline(waterRx) {
  const group = new THREE.Group();
  group.name = 'NycSkyline';
  const colors = [0xc8cdd4, 0xb0b8c2, 0xd8dce2, 0xa8b0bc];
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
    // Far ring — tall but distant so they sit low in the frame
    const distance = waterRx + 280 + Math.random() * 80;
    const w = 8 + Math.random() * 14;
    const d = 8 + Math.random() * 12;
    const h = 40 + Math.random() * 70;
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      createPaperMaterial(colors[i % colors.length]),
    );
    tower.position.set(
      Math.cos(angle) * distance,
      h * 0.5,
      Math.sin(angle) * distance,
    );
    tower.rotation.y = angle + Math.PI;
    group.add(tower);
  }
  return group;
}

function createKerbsBoathouse() {
  const g = new THREE.Group();
  const brick = createPaperMaterial(PALETTE.brickBoathouse);
  const copper = createPaperMaterial(PALETTE.copperRoof);
  const body = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 10), brick);
  body.position.y = 4;
  body.castShadow = true;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(20, 2.2, 12), copper);
  roof.position.y = 9.2;
  roof.castShadow = true;
  g.add(roof);
  const steeple = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 4, 6), copper);
  steeple.position.y = 12.5;
  g.add(steeple);
  return g;
}

/** Conservatory Water — oval Central Park model-boat pond. */
export function createConservatoryScenery(map) {
  const group = new THREE.Group();
  group.name = 'ConservatoryScenery';
  const { rx, rz } = map.water;
  const pathRx = map.path.rx;
  const pathRz = map.path.rz;
  const rzScale = rz / rx;

  const curb = new THREE.Mesh(
    new THREE.TorusGeometry(rx + 1.6, 1.4, 4, 64),
    createPaperMaterial(PALETTE.graniteRim),
  );
  curb.rotation.x = Math.PI / 2;
  curb.scale.set(1, 0.35, rzScale);
  curb.position.y = 0.22;
  curb.castShadow = true;
  curb.receiveShadow = true;
  group.add(curb);

  const path = createEllipseRingMesh(rx + 3.5, pathRx + 12, rzScale, createPaperMaterial(PALETTE.stonePath));
  group.add(path);

  const grass = createEllipseRingMesh(pathRx + 10, rx + 90, rzScale, createPaperMaterial(PALETTE.grass));
  grass.position.y = 0;
  group.add(grass);

  // Benches around the oval — kid-scaled, seat toward the water
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const p = ellipseOnRim(angle, pathRx + 2, pathRz + 2);
    const bench = createParkBench();
    bench.position.set(p.x, 0, p.z);
    faceBenchTowardFountain(bench);
    group.add(bench);
  }

  // Trees
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const distPad = 28 + Math.random() * 40;
    const p = ellipseOnRim(angle, rx + distPad, rz + distPad * (rz / rx));
    const tree = createParkTree({ landmark: i % 7 === 0 });
    tree.position.set(p.x, 0, p.z);
    tree.rotation.y = Math.random() * Math.PI * 2;
    group.add(tree);
  }

  // Kerbs-inspired boathouse on +X (east) shore
  const boathouse = createKerbsBoathouse();
  boathouse.position.set(rx + 22, 0, 0);
  boathouse.rotation.y = -Math.PI / 2;
  group.add(boathouse);

  // Lily clusters in the water
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const t = 0.25 + Math.random() * 0.55;
    const cluster = createLilyCluster();
    cluster.position.set(Math.cos(angle) * rx * t, 0.05, Math.sin(angle) * rz * t);
    group.add(cluster);
  }

  // Ducks
  for (let i = 0; i < 5; i++) {
    const duck = createDuck();
    const angle = Math.random() * Math.PI * 2;
    const t = 0.35 + Math.random() * 0.45;
    duck.userData.homeX = Math.cos(angle) * rx * t;
    duck.userData.homeZ = Math.sin(angle) * rz * t;
    duck.position.set(duck.userData.homeX, 0.12, duck.userData.homeZ);
    group.add(duck);
  }

  // Fish flashes under surface
  for (let i = 0; i < 6; i++) {
    const fish = createFishFlash();
    const angle = Math.random() * Math.PI * 2;
    const t = 0.2 + Math.random() * 0.6;
    fish.userData.homeX = Math.cos(angle) * rx * t;
    fish.userData.homeZ = Math.sin(angle) * rz * t;
    fish.position.set(fish.userData.homeX, -0.15, fish.userData.homeZ);
    group.add(fish);
  }

  group.add(createNycSkyline(rx));
  return group;
}

function createSwanBoat() {
  const g = new THREE.Group();
  const white = createPaperMaterial(PALETTE.swanWhite);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), white);
  body.scale.set(1.6, 0.7, 1.1);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.2, 6), white);
  neck.position.set(1.4, 1.6, 0);
  neck.rotation.z = 0.55;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), white);
  head.position.set(2.1, 2.5, 0);
  g.add(head);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.5, 5),
    createPaperMaterial(0xe07050),
  );
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(2.55, 2.4, 0);
  g.add(beak);
  g.userData.kind = 'swan';
  g.userData.phase = Math.random() * Math.PI * 2;
  g.userData.speed = 0.08 + Math.random() * 0.06;
  return g;
}

function createWoodDock() {
  const g = new THREE.Group();
  const wood = createPaperMaterial(PALETTE.dockWood);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 14), wood);
  plank.position.set(0, 0.35, -4);
  plank.castShadow = true;
  plank.receiveShadow = true;
  g.add(plank);
  for (const z of [-2, -6, -10]) {
    for (const x of [-2.4, 2.4]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 2.2, 6), wood);
      pile.position.set(x, 0.1, z);
      pile.castShadow = true;
      g.add(pile);
    }
  }
  // Small boathouse shed at shore end
  const shed = new THREE.Mesh(
    new THREE.BoxGeometry(8, 5, 6),
    createPaperMaterial(0xc4a882),
  );
  shed.position.set(0, 2.5, 4);
  shed.castShadow = true;
  g.add(shed);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(9, 1.2, 7),
    createPaperMaterial(0x8a6a4a),
  );
  roof.position.set(0, 5.4, 4);
  g.add(roof);
  return g;
}

function createPalmTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.55, 10, 6),
    createPaperMaterial(0x9a7a50),
  );
  trunk.position.y = 5;
  trunk.castShadow = true;
  g.add(trunk);
  const frondMat = createPaperMaterial(PALETTE.palmGreen);
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.4, 5.5, 5), frondMat);
    frond.position.y = 10;
    frond.rotation.z = 0.9;
    frond.rotation.y = (i / 6) * Math.PI * 2;
    frond.castShadow = true;
    g.add(frond);
  }
  return g;
}

function createOverhangBranch() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.4, 8, 5),
    createPaperMaterial(0x6e5640),
  );
  trunk.rotation.z = Math.PI / 2.4;
  trunk.position.set(0, 4, 0);
  g.add(trunk);
  const leaf = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.2, 0),
    createPaperMaterial(PALETTE.foliageDark),
  );
  leaf.position.set(3.5, 5.5, 0);
  leaf.scale.set(1.4, 0.7, 1.2);
  g.add(leaf);
  return g;
}

function createLotusBed() {
  const g = new THREE.Group();
  const padMat = createPaperMaterial(PALETTE.obstacleLily);
  const flowerMat = createPaperMaterial(PALETTE.lotusPink);
  for (let i = 0; i < 5; i++) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.5, 0.1, 8),
      padMat,
    );
    pad.position.set((Math.random() - 0.5) * 6, 0.1, (Math.random() - 0.5) * 6);
    g.add(pad);
    if (Math.random() > 0.35) {
      const flower = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 6), flowerMat);
      flower.position.copy(pad.position);
      flower.position.y = 0.7;
      g.add(flower);
    }
  }
  return g;
}

function createLaSkyline(waterRx) {
  const group = new THREE.Group();
  group.name = 'LaSkyline';
  const colors = [0xd8cfc0, 0xc4b8a8, 0xe0d6c8, 0xb8aea0];
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2 + 0.05;
    const distance = waterRx + 260 + Math.random() * 70;
    const w = 12 + Math.random() * 18;
    const d = 10 + Math.random() * 14;
    const h = 22 + Math.random() * 45;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      createPaperMaterial(colors[i % colors.length]),
    );
    block.position.set(
      Math.cos(angle) * distance,
      h * 0.5,
      Math.sin(angle) * distance,
    );
    block.rotation.y = angle + Math.PI;
    group.add(block);
  }
  return group;
}

function createEchoCenterFountain(radius) {
  const g = new THREE.Group();
  g.name = 'EchoCenter';
  const mound = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.9, radius, 1.2, 16),
    createPaperMaterial(PALETTE.islandSand),
  );
  mound.position.y = 0.4;
  mound.castShadow = true;
  g.add(mound);
  const jetMat = new THREE.MeshStandardMaterial({
    color: 0xb8dce8,
    transparent: true,
    opacity: 0.55,
  });
  for (let i = 0; i < 3; i++) {
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.15, 6 + i, 6), jetMat);
    jet.position.set((i - 1) * 1.2, 3.5 + i * 0.4, 0);
    g.add(jet);
  }
  return g;
}

/** Echo Park Lake — elongated LA lake with dock and swan boats. */
export function createEchoParkScenery(map) {
  const group = new THREE.Group();
  group.name = 'EchoParkScenery';
  const { rx, rz } = map.water;
  const pathRx = map.path.rx;
  const pathRz = map.path.rz;
  const rzScale = rz / rx;

  const curb = new THREE.Mesh(
    new THREE.TorusGeometry(rx + 1.4, 1.2, 4, 64),
    createPaperMaterial(0xb8c4a8),
  );
  curb.rotation.x = Math.PI / 2;
  curb.scale.set(1, 0.3, rzScale);
  curb.position.y = 0.18;
  curb.castShadow = true;
  group.add(curb);

  const path = createEllipseRingMesh(rx + 3.2, pathRx + 14, rzScale, createPaperMaterial(PALETTE.stonePath));
  group.add(path);

  const grass = createEllipseRingMesh(pathRx + 12, rx + 100, rzScale, createPaperMaterial(0xb5c99a));
  group.add(grass);

  // Wood dock on south shore (−Z)
  const dock = createWoodDock();
  dock.position.set(0, 0, -(rz + 2));
  group.add(dock);

  // Swan boats (props)
  for (let i = 0; i < 3; i++) {
    const swan = createSwanBoat();
    const angle = -0.4 + i * 0.35;
    const t = 0.45 + i * 0.08;
    swan.userData.homeX = Math.cos(angle) * rx * t;
    swan.userData.homeZ = Math.sin(angle) * rz * t - rz * 0.15;
    swan.position.set(swan.userData.homeX, 0.2, swan.userData.homeZ);
    swan.rotation.y = angle + Math.PI * 0.5;
    group.add(swan);
  }

  // Lotus beds NW
  for (let i = 0; i < 4; i++) {
    const bed = createLotusBed();
    const angle = Math.PI * 0.65 + i * 0.2;
    const t = 0.4 + Math.random() * 0.25;
    bed.position.set(Math.cos(angle) * rx * t, 0.05, Math.sin(angle) * rz * t);
    group.add(bed);
  }

  // Extra lily clusters
  for (let i = 0; i < 6; i++) {
    const cluster = createLilyCluster();
    const angle = Math.random() * Math.PI * 2;
    const t = 0.3 + Math.random() * 0.5;
    cluster.position.set(Math.cos(angle) * rx * t, 0.05, Math.sin(angle) * rz * t);
    group.add(cluster);
  }

  // Ducks
  for (let i = 0; i < 4; i++) {
    const duck = createDuck();
    const angle = Math.random() * Math.PI * 2;
    const t = 0.4 + Math.random() * 0.4;
    duck.userData.homeX = Math.cos(angle) * rx * t;
    duck.userData.homeZ = Math.sin(angle) * rz * t;
    duck.position.set(duck.userData.homeX, 0.12, duck.userData.homeZ);
    group.add(duck);
  }

  // Palms + overhanging branches
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    const p = ellipseOnRim(angle, rx + 32 + Math.random() * 30, rz + 28 + Math.random() * 28);
    const tree = i % 3 === 0 ? createPalmTree() : createParkTree();
    tree.position.set(p.x, 0, p.z);
    tree.rotation.y = Math.random() * Math.PI * 2;
    group.add(tree);
  }
  for (let i = 0; i < 4; i++) {
    const angle = 0.4 + i * 0.5;
    const p = ellipseOnRim(angle, rx + 8, rz + 6);
    const branch = createOverhangBranch();
    branch.position.set(p.x, 0, p.z);
    branch.rotation.y = angle + Math.PI;
    group.add(branch);
  }

  if (map.centerHazardRadius > 0) {
    group.add(createEchoCenterFountain(map.centerHazardRadius));
  }

  group.add(createLaSkyline(rx));
  return group;
}

/**
 * Build (or rebuild) water + scenery + centerpiece for a map payload.
 * @returns {{ root: THREE.Group, waterMat: THREE.Material, centerFountain: THREE.Object3D|null }}
 */
export function buildMapWorld(map) {
  const root = new THREE.Group();
  root.name = 'MapWorld';

  const palette = map.paletteHint || 'paris';
  const waterColor = WATER_COLORS[palette] || WATER_COLORS.paris;
  const waterMat = createWaterMaterial(waterColor);

  const rx = map.water?.rx ?? 100;
  const rz = map.water?.rz ?? 100;
  const water = createEllipseDisk(rx - 2.2, rz - 2.2, 0.02, waterMat);
  water.name = 'Water';
  root.add(water);

  const basinMat = createPaperMaterial(
    palette === 'la' ? 0x4a7a68 : palette === 'nyc' ? 0x4f6f88 : 0x4f87a0,
  );
  const basin = createEllipseDisk(rx - 1.8, rz - 1.8, -0.08, basinMat);
  basin.name = 'Basin';
  root.add(basin);

  let centerFountain = null;
  let scenery;
  if (map.sceneryKey === 'conservatory') {
    scenery = createConservatoryScenery(map);
  } else if (map.sceneryKey === 'echo_park') {
    scenery = createEchoParkScenery(map);
  } else {
    scenery = createParkScenery(rx);
    centerFountain = createCenterFountain();
    root.add(centerFountain);
  }
  root.add(scenery);

  return { root, waterMat, centerFountain, scenery };
}

/** Animate ducks, fish, swans under a map world root. */
export function updateMapAmbience(root, time) {
  if (!root) return;
  root.traverse((obj) => {
    const kind = obj.userData?.kind;
    if (!kind) return;
    const phase = obj.userData.phase || 0;
    const speed = obj.userData.speed || 0.2;
    const hx = obj.userData.homeX ?? obj.position.x;
    const hz = obj.userData.homeZ ?? obj.position.z;
    if (kind === 'duck' || kind === 'swan') {
      const r = (obj.userData.orbitR || 2) * (kind === 'swan' ? 1.5 : 1);
      obj.position.x = hx + Math.cos(time * speed + phase) * r;
      obj.position.z = hz + Math.sin(time * speed + phase) * r;
      obj.rotation.y = time * speed + phase + Math.PI / 2;
      obj.position.y = kind === 'swan' ? 0.2 : 0.12 + Math.sin(time * 2 + phase) * 0.04;
    } else if (kind === 'fish') {
      obj.position.x = hx + Math.cos(time * speed + phase) * 3;
      obj.position.z = hz + Math.sin(time * speed * 0.7 + phase) * 2;
      obj.material.opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 3 + phase));
    }
  });
}
