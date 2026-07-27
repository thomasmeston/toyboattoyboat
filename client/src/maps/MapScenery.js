import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createPaperMaterial, PALETTE, WATER_COLORS, createWaterMaterial } from '../StyleSystem.js';
import { createParkScenery, createParkTree, createParkBench, faceBenchTowardFountain } from '../Assets.js';
import { createCenterFountain, createEchoParkFountain } from '../FountainCenter.js';
import { assetUrl } from '../assetUrl.js';

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

function createEllipseRingMesh(innerRx, outerRx, rzScale, material, y = 0.01) {
  const geo = new THREE.RingGeometry(innerRx, outerRx, 48);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.scale.z = rzScale;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Papercraft duck. Adults are mallard-colored; only ducklings stay yellow.
 * Head is a separate group so it can look / bob.
 * @param {{ baby?: boolean, hen?: boolean }} [opts]
 */
function createDuck({ baby = false, hen = false } = {}) {
  const g = new THREE.Group();
  g.name = baby ? 'Duckling' : hen ? 'DuckHen' : 'DuckDrake';
  const s = baby ? 0.5 : 1;

  // Palette — ducklings yellow; hens mottled brown; drakes classic mallard
  const colors = baby
    ? {
      body: 0xf2d06a,
      breast: 0xf6dc88,
      head: 0xf8e090,
      bill: 0xe8a040,
      wing: 0xe8c85a,
      tail: 0xe0b848,
    }
    : hen
      ? {
        body: 0x8a6a48,
        breast: 0x9a7a55,
        head: 0x7a5a3a,
        bill: 0xc4883a,
        wing: 0x6e5438,
        tail: 0x5a4430,
        speculum: 0x3a6a9a,
      }
      : {
        body: 0x9aa0a6,
        breast: 0xa85428,
        head: 0x1f6b4a,
        bill: 0xe8a030,
        wing: 0x7a8088,
        tail: 0x2a2a2e,
        ring: 0xf4f0e8,
        speculum: 0x2f6fad,
      };

  // Elongated floating body
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.52 * s, 10, 8),
    createPaperMaterial(colors.body),
  );
  body.scale.set(1.55, 0.72, 1.05);
  body.position.set(-0.05 * s, 0.32 * s, 0);
  g.add(body);

  // Breast / chest
  const breast = new THREE.Mesh(
    new THREE.SphereGeometry(0.38 * s, 8, 6),
    createPaperMaterial(colors.breast),
  );
  breast.scale.set(0.95, 0.85, 1.05);
  breast.position.set(0.35 * s, 0.34 * s, 0);
  g.add(breast);

  // Wing pads
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(
      new THREE.SphereGeometry(0.28 * s, 8, 6),
      createPaperMaterial(colors.wing),
    );
    wing.scale.set(1.15, 0.35, 0.7);
    wing.position.set(-0.05 * s, 0.42 * s, side * 0.42 * s);
    wing.rotation.z = side * 0.15;
    g.add(wing);
    if (colors.speculum) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.22 * s, 0.06 * s, 0.12 * s),
        createPaperMaterial(colors.speculum),
      );
      bar.position.set(0.02 * s, 0.44 * s, side * 0.5 * s);
      g.add(bar);
    }
  }

  // Tail
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.2 * s, 0.4 * s, 6),
    createPaperMaterial(colors.tail),
  );
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-0.85 * s, 0.38 * s, 0);
  g.add(tail);

  // Head + neck (animated)
  const headGroup = new THREE.Group();
  headGroup.name = 'DuckHead';
  headGroup.position.set(0.55 * s, 0.55 * s, 0);

  if (!baby) {
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14 * s, 0.18 * s, 0.28 * s, 8),
      createPaperMaterial(hen ? colors.head : colors.breast),
    );
    neck.position.set(-0.06 * s, 0.05 * s, 0);
    neck.rotation.z = 0.35;
    headGroup.add(neck);
    if (colors.ring) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.17 * s, 0.035 * s, 6, 12),
        createPaperMaterial(colors.ring),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0.02 * s, 0.16 * s, 0);
      headGroup.add(ring);
    }
  }

  const head = new THREE.Mesh(
    new THREE.SphereGeometry((baby ? 0.3 : 0.28) * s, 10, 8),
    createPaperMaterial(colors.head),
  );
  head.scale.set(1.05, 0.95, 1.0);
  head.position.set(0.08 * s, 0.28 * s, 0);
  headGroup.add(head);

  // Flattened bill
  const bill = new THREE.Mesh(
    new THREE.BoxGeometry(0.34 * s, 0.1 * s, 0.16 * s),
    createPaperMaterial(colors.bill),
  );
  bill.position.set(0.32 * s, 0.22 * s, 0);
  bill.rotation.z = -0.08;
  headGroup.add(bill);

  g.add(headGroup);

  g.userData.kind = baby ? 'duckling' : 'duck';
  g.userData.head = headGroup;
  g.userData.phase = Math.random() * Math.PI * 2;
  g.userData.heading = Math.random() * Math.PI * 2;
  g.userData.speed = baby ? 0.9 + Math.random() * 0.4 : 1.1 + Math.random() * 0.7;
  g.userData.turnTimer = 1 + Math.random() * 3;
  g.userData.peckTimer = 2 + Math.random() * 5;
  g.userData.lastTime = null;
  g.userData.waterY = 0.12;
  return g;
}

/** Mommy duck with a short line of ducklings following behind. */
function createDuckFamily() {
  const family = new THREE.Group();
  family.name = 'DuckFamily';
  const mom = createDuck({ baby: false, hen: true });
  mom.userData.kind = 'duckMom';
  family.add(mom);

  const babyCount = 3 + Math.floor(Math.random() * 3); // 3–5
  const babies = [];
  for (let i = 0; i < babyCount; i++) {
    const baby = createDuck({ baby: true });
    baby.userData.kind = 'duckling';
    baby.position.set(-(i + 1) * 1.05, 0, (i % 2 === 0 ? 0.12 : -0.12));
    family.add(baby);
    babies.push(baby);
  }

  family.userData.kind = 'duckFamily';
  family.userData.mom = mom;
  family.userData.babies = babies;
  family.userData.heading = Math.random() * Math.PI * 2;
  family.userData.speed = 1.4 + Math.random() * 0.6;
  family.userData.turnTimer = 2 + Math.random() * 4;
  family.userData.phase = Math.random() * Math.PI * 2;
  family.userData.lastTime = null;
  family.userData.waterY = 0.12;
  family.rotation.y = family.userData.heading;
  return family;
}

/** Solo ducks + occasional mommy-and-babies procession for a map basin. */
function createLakeDucks(waterRx, waterRz = waterRx) {
  const root = new THREE.Group();
  root.name = 'LakeDucks';
  let duckSeq = 0;
  const tagDuck = (obj) => {
    obj.userData.courseTargetId = `duck_${duckSeq++}`;
  };

  const soloCount = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < soloCount; i++) {
    const duck = createDuck({ hen: Math.random() < 0.45 });
    tagDuck(duck);
    const angle = Math.random() * Math.PI * 2;
    const t = 0.25 + Math.random() * 0.5;
    duck.position.set(Math.cos(angle) * waterRx * t, duck.userData.waterY, Math.sin(angle) * waterRz * t);
    duck.userData.boundsRx = waterRx * 0.82;
    duck.userData.boundsRz = waterRz * 0.82;
    duck.rotation.y = duck.userData.heading;
    root.add(duck);
  }

  // Often one family crossing the water
  if (Math.random() < 0.85) {
    const family = createDuckFamily();
    tagDuck(family.userData.mom);
    for (const baby of family.userData.babies || []) tagDuck(baby);
    const angle = Math.random() * Math.PI * 2;
    const t = 0.3 + Math.random() * 0.4;
    family.position.set(
      Math.cos(angle) * waterRx * t,
      family.userData.waterY,
      Math.sin(angle) * waterRz * t,
    );
    family.userData.boundsRx = waterRx * 0.8;
    family.userData.boundsRz = waterRz * 0.8;
    root.add(family);
  }
  return root;
}

/** Stable course target ids for every duck / duckling under a map world. */
export function listDuckCourseTargetIds(root) {
  const ids = [];
  if (!root) return ids;
  root.traverse((obj) => {
    const kind = obj.userData?.kind;
    if (kind !== 'duck' && kind !== 'duckMom' && kind !== 'duckling') return;
    const id = obj.userData.courseTargetId;
    if (typeof id === 'string') ids.push(id);
  });
  return ids;
}

function animateDuckHead(duck, time, dt) {
  const head = duck.userData.head;
  if (!head) return;
  const phase = duck.userData.phase || 0;
  duck.userData.peckTimer = (duck.userData.peckTimer ?? 3) - dt;
  if (duck.userData.peckTimer <= 0) {
    duck.userData.pecking = 0.45 + Math.random() * 0.35;
    duck.userData.peckTimer = 2.5 + Math.random() * 6;
  }
  if (duck.userData.pecking > 0) {
    duck.userData.pecking -= dt;
    head.rotation.z = -0.55 * Math.sin((1 - duck.userData.pecking) * Math.PI);
    head.rotation.y = 0;
  } else {
    head.rotation.y = Math.sin(time * 1.3 + phase) * 0.45;
    head.rotation.z = Math.sin(time * 2.1 + phase * 1.7) * 0.12;
  }
}

function stepDuckWander(obj, time, dt, {
  defaultSpeed = 1.2,
  turnScale = 1.6,
} = {}) {
  obj.userData.turnTimer = (obj.userData.turnTimer ?? 2) - dt;
  if (obj.userData.turnTimer <= 0) {
    obj.userData.heading = (obj.userData.heading || 0) + (Math.random() - 0.5) * turnScale;
    obj.userData.turnTimer = 1.5 + Math.random() * 4;
    obj.userData.speed = defaultSpeed * (0.75 + Math.random() * 0.5);
  }

  const bRx = obj.userData.boundsRx || 70;
  const bRz = obj.userData.boundsRz || 70;
  const nx = obj.position.x / bRx;
  const nz = obj.position.z / bRz;
  if (nx * nx + nz * nz > 0.9) {
    obj.userData.heading = Math.atan2(-obj.position.z, -obj.position.x)
      + (Math.random() - 0.5) * 0.5;
    obj.userData.turnTimer = 1.2 + Math.random() * 2;
  }

  const heading = obj.userData.heading || 0;
  const spd = obj.userData.speed || defaultSpeed;
  obj.position.x += Math.cos(heading) * spd * dt;
  obj.position.z += Math.sin(heading) * spd * dt;
  const waterY = obj.userData.waterY ?? 0.12;
  const phase = obj.userData.phase || 0;
  obj.position.y = waterY + Math.sin(time * 2.4 + phase) * 0.05;
  obj.rotation.y = heading;
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

const FISH_COLORS = [0xc9a24a, 0xd4b06a, 0xe8c56a, 0xb8893a, 0x8eb4c8];

/** Tiny stylized fish for underwater schools. */
function createSchoolFish(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.15,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat);
  body.scale.set(1.6, 0.7, 0.85);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 5), mat);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.38;
  g.add(tail);
  g.userData.wigglePhase = Math.random() * Math.PI * 2;
  return g;
}

/**
 * A few small schools that wander randomly under the water surface.
 * @returns {THREE.Group}
 */
function createFishSchools(waterRx, waterRz = waterRx) {
  const root = new THREE.Group();
  root.name = 'FishSchools';
  const schoolCount = 3 + Math.floor(Math.random() * 2); // 3–4 schools
  for (let s = 0; s < schoolCount; s++) {
    const school = new THREE.Group();
    school.name = 'FishSchool';
    const angle = Math.random() * Math.PI * 2;
    const t = 0.2 + Math.random() * 0.55;
    const x = Math.cos(angle) * waterRx * t;
    const z = Math.sin(angle) * waterRz * t;
    const depth = -0.35 - Math.random() * 0.35;
    school.position.set(x, depth, z);

    const heading = Math.random() * Math.PI * 2;
    school.userData.kind = 'fishSchool';
    school.userData.heading = heading;
    school.userData.speed = 1.8 + Math.random() * 1.6;
    school.userData.turnTimer = 1.5 + Math.random() * 3;
    school.userData.boundsRx = waterRx * 0.78;
    school.userData.boundsRz = waterRz * 0.78;
    school.userData.baseDepth = depth;
    school.userData.phase = Math.random() * Math.PI * 2;
    school.userData.lastTime = null;

    const fishCount = 4 + Math.floor(Math.random() * 4); // 4–7 fish
    const color = FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)];
    for (let i = 0; i < fishCount; i++) {
      const fish = createSchoolFish(color);
      fish.position.set(
        (Math.random() - 0.5) * 1.8,
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 1.4,
      );
      fish.rotation.y = Math.random() * 0.4;
      school.add(fish);
    }
    school.rotation.y = heading;
    root.add(school);
  }
  return root;
}

function createNycBuilding({ tall = false, mid = false } = {}) {
  const g = new THREE.Group();
  const colors = [0xc8cdd4, 0xb0b8c2, 0xd8dce2, 0xa8b0bc, 0xbec6d0, 0xd0d5dc];
  const glass = createPaperMaterial(0x8aa8c0);
  const bodyColor = colors[Math.floor(Math.random() * colors.length)];
  const w = mid ? 7 + Math.random() * 11 : 12 + Math.random() * 20;
  const d = mid ? 6 + Math.random() * 9 : 10 + Math.random() * 16;
  const h = tall
    ? 70 + Math.random() * 90
    : mid
      ? 16 + Math.random() * 28
      : 36 + Math.random() * 55;

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), createPaperMaterial(bodyColor));
  body.position.y = h * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  if (h > 22) {
    const bands = 2 + Math.floor(Math.random() * 4);
    for (let b = 0; b < bands; b++) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.9, h * 0.05, d * 1.02),
        glass,
      );
      band.position.y = h * (0.2 + b * 0.18);
      g.add(band);
    }
  }

  // Spire / setback tip on taller towers
  if (tall || Math.random() > 0.5) {
    const tipH = tall ? 10 + Math.random() * 18 : 4 + Math.random() * 8;
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.35, tipH, d * 0.35),
      createPaperMaterial(0x9aa3b0),
    );
    tip.position.y = h + tipH * 0.45;
    tip.castShadow = true;
    g.add(tip);
  }
  return g;
}

/** Mid-range Upper East / Midtown blocks just beyond the tree ring. */
function createNycBackgroundBuildings(waterRx, waterRz = waterRx) {
  const group = new THREE.Group();
  group.name = 'NycBackgroundBuildings';
  const count = 48;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
    // Leave a small gap at the east boathouse so Kerbs stays readable
    if (angle > -0.35 && angle < 0.35) continue;
    const dist = Math.max(waterRx, waterRz) + 78 + Math.random() * 50;
    const block = createNycBuilding({ mid: true, tall: Math.random() > 0.88 });
    block.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    block.rotation.y = angle + Math.PI + (Math.random() - 0.5) * 0.3;
    group.add(block);
  }
  return group;
}

/** Dense downtown skyline ring all around Conservatory Water. */
function createNycSkyline(waterRx, waterRz = waterRx) {
  const group = new THREE.Group();
  group.name = 'NycSkyline';
  const rim = Math.max(waterRx, waterRz);
  const count = 52;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.06;
    const dist = rim + 200 + Math.random() * 100;
    const tower = createNycBuilding({ tall: Math.random() > 0.4 });
    tower.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    tower.rotation.y = angle + Math.PI + (Math.random() - 0.5) * 0.15;
    group.add(tower);
  }
  // Extra Midtown mass to the south (−Z)
  for (let i = 0; i < 18; i++) {
    const angle = Math.PI * 0.5 + (i / 18) * 1.1 - 0.55 + (Math.random() - 0.5) * 0.05;
    const dist = rim + 230 + Math.random() * 70;
    const tower = createNycBuilding({ tall: true });
    tower.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
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

/** Papercraft balloon vendor with a floating bunch (Central Park sidewalk cart). */
function createBalloonSalesman() {
  const g = new THREE.Group();
  g.name = 'BalloonSalesman';

  // Small wheeled cart
  const cart = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.6, 1.6),
    createPaperMaterial(0xf0ebe3),
  );
  cart.position.set(0.9, 1.4, 0);
  cart.castShadow = true;
  g.add(cart);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.45, 0.35, 1.65),
    createPaperMaterial(0xe85a7a),
  );
  stripe.position.set(0.9, 2.0, 0);
  g.add(stripe);
  for (const z of [-0.55, 0.55]) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.2, 10),
      createPaperMaterial(0x3a3530),
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0.9, 0.35, z);
    g.add(wheel);
  }

  // Vendor figure
  const coat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.55, 1.7, 8),
    createPaperMaterial(0x3d5a80),
  );
  coat.position.set(-0.35, 1.55, 0.15);
  coat.castShadow = true;
  g.add(coat);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 10, 8),
    createPaperMaterial(0xffdfd0),
  );
  head.position.set(-0.35, 2.7, 0.15);
  g.add(head);
  const hat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10),
    createPaperMaterial(0x2b2b2b),
  );
  hat.position.set(-0.35, 3.05, 0.15);
  g.add(hat);
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.08, 12),
    createPaperMaterial(0x2b2b2b),
  );
  brim.position.set(-0.35, 2.9, 0.15);
  g.add(brim);

  // Balloon bunch on strings
      const balloonColors = [0xe85a5a, 0xf4c430, 0x5a9fe8, 0xe85a9a, 0x6bcb5a, 0xf28c28, 0x9b6bdf];
  const bunch = new THREE.Group();
  bunch.position.set(0.2, 3.4, 0.1);
  for (let i = 0; i < 9; i++) {
    const color = balloonColors[i % balloonColors.length];
    const balloon = new THREE.Mesh(
      new THREE.SphereGeometry(0.42 + Math.random() * 0.12, 10, 8),
      createPaperMaterial(color),
    );
    const a = (i / 9) * Math.PI * 2;
    const r = 0.35 + (i % 3) * 0.2;
    balloon.position.set(Math.cos(a) * r, 1.2 + Math.random() * 0.9, Math.sin(a) * r);
    balloon.castShadow = true;
    bunch.add(balloon);
    // Tiny knot under balloon
    const knot = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.14, 5),
      createPaperMaterial(color),
    );
    knot.position.copy(balloon.position);
    knot.position.y -= 0.42;
    bunch.add(knot);
  }
  // Shared string stem in the vendor's hand
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 2.2, 5),
    createPaperMaterial(0xd8d0c4),
  );
  stem.position.set(0.05, 0.2, 0.05);
  bunch.add(stem);
  g.add(bunch);

  g.userData.kind = 'balloonSalesman';
  g.userData.bunch = bunch;
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
  curb.scale.set(1, rzScale, 0.35);
  curb.position.y = 0.22;
  curb.castShadow = true;
  curb.receiveShadow = true;
  group.add(curb);

  // Path above grass; outer edge meets grass inner with a tiny gap (no coplanar overlap)
  const pathOuter = pathRx + 12;
  const path = createEllipseRingMesh(rx + 3.5, pathOuter, rzScale, createPaperMaterial(PALETTE.stonePath), 0.06);
  group.add(path);

  const grass = createEllipseRingMesh(pathOuter + 0.4, rx + 90, rzScale, createPaperMaterial(PALETTE.grass), 0);
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

  // Hot dog carts on the path (NW + SW shores)
  for (const angle of [2.35, 3.95]) {
    const cart = createFoodCart();
    const p = ellipseOnRim(angle, pathRx + 1.2, pathRz + 1.2);
    cart.position.set(p.x, 0, p.z);
    cart.rotation.y = angle + Math.PI; // face the water
    group.add(cart);
  }

  // Balloon salesman on the north path, facing the pond
  const balloonMan = createBalloonSalesman();
  const balloonPos = ellipseOnRim(-Math.PI * 0.5, pathRx + 2.5, pathRz + 2.5);
  balloonMan.position.set(balloonPos.x, 0, balloonPos.z);
  balloonMan.rotation.y = Math.PI; // face south toward water
  group.add(balloonMan);

  // Neighborhood blocks + dense skyline all around
  group.add(createNycBackgroundBuildings(rx, rz));
  group.add(createNycSkyline(rx, rz));
  return group;
}

/**
 * Swan Boat by Polygonal_64 (CC-BY) — Sketchfab
 * https://sketchfab.com/3d-models/swan-boat-4005d64c3f7b44878802aca82b7e2678
 */
const SWAN_BOAT_URL = assetUrl('models/swan-boat.glb');
/**
 * Venus de Milo — SMK National Gallery of Denmark (CC0)
 * https://sketchfab.com/3d-models/venus-de-milo-aphrodite-of-milos-53082b5d6cef4c34a9701a2a24f58075
 */
const WOMAN_STATUE_URL = assetUrl('models/woman-statue.glb');
/** Lighthouse — Poly by Google (CC-BY) https://poly.pizza/m/7H8is9jrGeB */
const LIGHTHOUSE_URL = assetUrl('models/lighthouse.glb');
let _swanBoatTemplatePromise = null;
let _statueTemplatePromise = null;
let _lighthouseTemplatePromise = null;

/** Matches shared/maps.js echo_park_lake.scenerySolids */
const ECHO_STATUE_ISLAND = { x: -91, z: 12, radius: 20 };
const ECHO_STATUE_HEIGHT = 13;

function loadGltfScene(url) {
  return new Promise((resolve) => {
    new GLTFLoader().load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      () => resolve(null),
    );
  });
}

function loadSwanBoatTemplate() {
  if (!_swanBoatTemplatePromise) {
    _swanBoatTemplatePromise = loadGltfScene(SWAN_BOAT_URL);
  }
  return _swanBoatTemplatePromise;
}

function loadStatueTemplate() {
  if (!_statueTemplatePromise) {
    _statueTemplatePromise = loadGltfScene(WOMAN_STATUE_URL);
  }
  return _statueTemplatePromise;
}

function loadLighthouseTemplate() {
  if (!_lighthouseTemplatePromise) {
    _lighthouseTemplatePromise = loadGltfScene(LIGHTHOUSE_URL);
  }
  return _lighthouseTemplatePromise;
}

function normalizePropHeight(model, targetHeight) {
  const clone = cloneSkinned(model);
  clone.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    }
  });
  clone.updateMatrixWorld(true);
  const box = meshBounds(clone);
  const size = box.getSize(new THREE.Vector3());
  clone.scale.setScalar(targetHeight / Math.max(size.y, 0.001));
  clone.updateMatrixWorld(true);
  const grounded = meshBounds(clone);
  const center = grounded.getCenter(new THREE.Vector3());
  clone.position.x -= center.x;
  clone.position.z -= center.z;
  clone.position.y -= grounded.min.y;
  return clone;
}

function paintModel(root, color) {
  const mat = createPaperMaterial(color);
  root.traverse((child) => {
    if (child.isMesh) {
      child.material = mat;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

/** Cool marble / stone for the Venus landmark. */
function paintMarble(root) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xe9e4db,
    roughness: 0.32,
    metalness: 0.04,
  });
  root.traverse((child) => {
    if (!child.isMesh) return;
    const old = child.material;
    if (old) {
      if (Array.isArray(old)) old.forEach((m) => m?.dispose?.());
      else old.dispose?.();
    }
    child.material = mat;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function createWhiteLighthouse() {
  const g = new THREE.Group();
  g.name = 'DockLighthouse';
  const white = createPaperMaterial(PALETTE.lighthouseWhite);
  const cream = createPaperMaterial(0xece6dc);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 2.2, 10), cream);
  base.position.y = 1.1;
  base.castShadow = true;
  g.add(base);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.6, 16, 10), white);
  tower.position.y = 2.2 + 8;
  tower.castShadow = true;
  g.add(tower);

  const walk = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.45, 10), cream);
  walk.position.y = 18.4;
  walk.castShadow = true;
  g.add(walk);

  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.7, 2.4, 8),
    new THREE.MeshStandardMaterial({
      color: 0xfff2c8,
      emissive: PALETTE.lighthouseLight,
      emissiveIntensity: 0.55,
      roughness: 0.45,
    }),
  );
  lantern.position.y = 20.0;
  g.add(lantern);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.8, 8), white);
  roof.position.y = 22.4;
  roof.castShadow = true;
  g.add(roof);

  // Prefer GLB if available; keep procedural as fallback
  loadLighthouseTemplate().then((template) => {
    if (!template) return;
    const model = normalizePropHeight(template, 22);
    paintModel(model, PALETTE.lighthouseWhite);
    while (g.children.length) {
      const c = g.children[0];
      g.remove(c);
      disposeObject3D(c);
    }
    g.add(model);
  });

  return g;
}

function createStatueIsland(radius = ECHO_STATUE_ISLAND.radius) {
  const g = new THREE.Group();
  g.name = 'StatueIsland';

  const sandMat = createPaperMaterial(PALETTE.islandSand);
  const dirtMat = createPaperMaterial(PALETTE.islandDirt);
  const grassMat = createPaperMaterial(PALETTE.islandGrass);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xd9d3c8,
    roughness: 0.55,
    metalness: 0.02,
  });

  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    sandMat,
  );
  mound.scale.set(1.15, 0.42, 1.05);
  mound.position.y = 0.05;
  mound.castShadow = true;
  mound.receiveShadow = true;
  g.add(mound);

  const dirt = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.78, radius * 0.95, radius * 0.32, 12),
    dirtMat,
  );
  dirt.position.y = radius * 0.2;
  dirt.castShadow = true;
  g.add(dirt);

  const grass = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.72, radius * 0.8, radius * 0.2, 12),
    grassMat,
  );
  grass.position.y = radius * 0.38;
  grass.castShadow = true;
  g.add(grass);

  const plinthH = 1.8;
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(2.8, 3.4, plinthH, 10),
    stoneMat,
  );
  pedestal.position.y = radius * 0.5 + plinthH * 0.5;
  pedestal.castShadow = true;
  g.add(pedestal);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(3.0, 2.9, 0.4, 10),
    stoneMat,
  );
  cap.position.y = pedestal.position.y + plinthH * 0.5 + 0.25;
  cap.castShadow = true;
  g.add(cap);

  const statueY = cap.position.y + 0.3;
  const placeholder = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, ECHO_STATUE_HEIGHT * 0.85, 7),
    stoneMat,
  );
  placeholder.position.y = statueY + ECHO_STATUE_HEIGHT * 0.4;
  g.add(placeholder);

  loadStatueTemplate().then((template) => {
    if (!template) {
      console.warn('[statue] woman-statue.glb failed to load; keeping placeholder');
      return;
    }
    g.remove(placeholder);
    disposeObject3D(placeholder);
    const statue = normalizePropHeight(template, ECHO_STATUE_HEIGHT);
    paintMarble(statue);
    statue.position.y = statueY;
    // Face toward lake center
    statue.rotation.y = Math.atan2(-ECHO_STATUE_ISLAND.x, -ECHO_STATUE_ISLAND.z);
    g.add(statue);
  });

  return g;
}

function meshBounds(root) {
  const box = new THREE.Box3();
  root.traverse((child) => {
    if (child.isMesh) box.expandByObject(child);
  });
  if (box.isEmpty()) box.setFromObject(root);
  return box;
}

/** Match BoatModels.normalizeBoat: scale by footprint (xz), ground keel to y=0. */
function normalizeProp(model, targetLen) {
  // SkeletonUtils required for Sketchfab skinned meshes (plain clone breaks skinning)
  const clone = cloneSkinned(model);
  clone.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    }
  });
  clone.updateMatrixWorld(true);
  const box = meshBounds(clone);
  const size = box.getSize(new THREE.Vector3());
  const footprint = Math.max(size.x, size.z, 0.001);
  clone.scale.setScalar(targetLen / footprint);
  clone.updateMatrixWorld(true);
  const grounded = meshBounds(clone);
  const center = grounded.getCenter(new THREE.Vector3());
  clone.position.x -= center.x;
  clone.position.z -= center.z;
  clone.position.y -= grounded.min.y;
  return clone;
}

function createProceduralSwanBoat() {
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
  return g;
}

function createSwanBoat() {
  const g = new THREE.Group();
  g.userData.kind = 'swan';
  g.userData.phase = Math.random() * Math.PI * 2;
  g.userData.speed = 0.08 + Math.random() * 0.06;
  g.userData.orbitR = 1.2;

  const swanDraft = 2.0;
  const fallback = normalizeProp(createProceduralSwanBoat(), 13);
  fallback.position.y -= swanDraft;
  g.add(fallback);

  loadSwanBoatTemplate().then((template) => {
    if (!template) {
      console.warn('[swan-boat] GLB failed to load; keeping procedural fallback');
      return;
    }
    g.remove(fallback);
    disposeObject3D(fallback);
    // Keel at y=0 then sink hull into the waterline
    const boat = normalizeProp(template, 13);
    boat.position.y -= swanDraft;
    g.add(boat);
  });

  return g;
}

function createWoodDock() {
  const g = new THREE.Group();
  const wood = createPaperMaterial(PALETTE.dockWood);
  // ~2× prior footprint — long pier into the lake
  const plank = new THREE.Mesh(new THREE.BoxGeometry(12, 0.45, 28), wood);
  plank.position.set(0, 0.4, -8);
  plank.castShadow = true;
  plank.receiveShadow = true;
  g.add(plank);
  for (const z of [-2, -8, -14, -20]) {
    for (const x of [-4.8, 4.8]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 3.2, 6), wood);
      pile.position.set(x, 0.15, z);
      pile.castShadow = true;
      g.add(pile);
    }
  }
  const shed = new THREE.Mesh(
    new THREE.BoxGeometry(14, 7, 10),
    createPaperMaterial(0xc4a882),
  );
  shed.position.set(0, 3.5, 8);
  shed.castShadow = true;
  g.add(shed);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(16, 1.6, 12),
    createPaperMaterial(0x8a6a4a),
  );
  roof.position.set(0, 7.6, 8);
  g.add(roof);
  return g;
}

function createPalmTree() {
  const g = new THREE.Group();
  const trunkH = 11;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.5, trunkH, 7),
    createPaperMaterial(0x9a7a50),
  );
  trunk.position.y = trunkH * 0.5;
  trunk.castShadow = true;
  g.add(trunk);
  const frondMat = createPaperMaterial(PALETTE.palmGreen);
  const crownY = trunkH;
  for (let i = 0; i < 8; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.35, 6.2, 5), frondMat);
    frond.position.set(0, crownY, 0);
    frond.rotation.order = 'YZX';
    frond.rotation.y = (i / 8) * Math.PI * 2;
    frond.rotation.z = 0.95 + (i % 3) * 0.08;
    frond.castShadow = true;
    g.add(frond);
  }
  // Small top tuft so the crown reads as palm, not a bare stick
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.55, 6, 5), frondMat);
  tuft.position.y = crownY + 0.2;
  tuft.scale.set(1.1, 0.55, 1.1);
  g.add(tuft);
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

function createLaBuilding({ tall = false, mid = false } = {}) {
  const g = new THREE.Group();
  const colors = [0xd8cfc0, 0xc4b8a8, 0xe0d6c8, 0xb8aea0, 0xcfc6b8, 0xddd4c6];
  const glass = createPaperMaterial(0xa8c4d4);
  const bodyColor = colors[Math.floor(Math.random() * colors.length)];
  const w = mid ? 8 + Math.random() * 12 : 14 + Math.random() * 22;
  const d = mid ? 7 + Math.random() * 10 : 12 + Math.random() * 18;
  const h = tall
    ? 55 + Math.random() * 70
    : mid
      ? 14 + Math.random() * 22
      : 28 + Math.random() * 50;

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), createPaperMaterial(bodyColor));
  body.position.y = h * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // Window band accents (reads as city facade from afar)
  if (h > 20) {
    const bands = 2 + Math.floor(Math.random() * 3);
    for (let b = 0; b < bands; b++) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.92, h * 0.06, d * 1.02),
        glass,
      );
      band.position.y = h * (0.25 + b * 0.22);
      g.add(band);
    }
  }

  if (tall || Math.random() > 0.55) {
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.7, Math.min(8, h * 0.12), d * 0.7),
      createPaperMaterial(0xb0a898),
    );
    cap.position.y = h + Math.min(8, h * 0.12) * 0.45;
    g.add(cap);
  }
  return g;
}

/** Far downtown skyline ring — tall silhouettes in the haze. */
function createLaSkyline(waterRx, waterRz = waterRx) {
  const group = new THREE.Group();
  group.name = 'LaSkyline';
  const count = 36;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
    const dist = Math.max(waterRx, waterRz) + 220 + Math.random() * 90;
    const tower = createLaBuilding({ tall: Math.random() > 0.55 });
    tower.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    tower.rotation.y = angle + Math.PI + (Math.random() - 0.5) * 0.2;
    group.add(tower);
  }
  // Dense downtown cluster (north-east) for a recognizable LA skyline mass
  for (let i = 0; i < 14; i++) {
    const angle = -0.35 + (i / 14) * 0.9 + (Math.random() - 0.5) * 0.05;
    const dist = Math.max(waterRx, waterRz) + 240 + Math.random() * 50;
    const tower = createLaBuilding({ tall: true });
    tower.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    tower.rotation.y = angle + Math.PI;
    group.add(tower);
  }
  return group;
}

/** Mid-range neighborhood buildings just beyond the palm ring. */
function createLaBackgroundBuildings(waterRx, waterRz = waterRx) {
  const group = new THREE.Group();
  group.name = 'LaBackgroundBuildings';
  const count = 40;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
    // Skip south dock sector a bit so the pier stays readable
    if (angle > 4.2 && angle < 5.3) continue;
    const dist = Math.max(waterRx, waterRz) + 70 + Math.random() * 55;
    const block = createLaBuilding({ mid: true, tall: Math.random() > 0.85 });
    block.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    block.rotation.y = angle + Math.PI + (Math.random() - 0.5) * 0.35;
    group.add(block);
  }
  return group;
}

const FOOD_CART_URL = assetUrl('models/food-cart.glb');
let _foodCartTemplatePromise = null;

function loadFoodCartTemplate() {
  if (!_foodCartTemplatePromise) {
    _foodCartTemplatePromise = loadGltfScene(FOOD_CART_URL);
  }
  return _foodCartTemplatePromise;
}

function createProceduralFoodCart() {
  const g = new THREE.Group();
  g.name = 'FoodCart';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 2.4, 2.0),
    createPaperMaterial(0xf2f0ea),
  );
  body.position.y = 1.9;
  body.castShadow = true;
  g.add(body);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.25, 0.45, 2.05),
    createPaperMaterial(0xe85a5a),
  );
  stripe.position.y = 2.5;
  g.add(stripe);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.15, 2.6),
    createPaperMaterial(0xe85a5a),
  );
  awning.position.set(0, 3.25, 0.2);
  awning.rotation.x = -0.15;
  g.add(awning);
  const window = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.9, 0.12),
    createPaperMaterial(0x7eb8d4),
  );
  window.position.set(0, 2.15, 1.05);
  g.add(window);
  for (const x of [-1.2, 1.2]) {
    for (const z of [-0.7, 0.7]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.25, 10),
        createPaperMaterial(0x3a3530),
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.45, z);
      g.add(wheel);
    }
  }
  const umbrella = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 0.7, 8),
    createPaperMaterial(0xf7f4ef),
  );
  umbrella.position.set(0, 4.2, 0);
  g.add(umbrella);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6),
    createPaperMaterial(0xc4b8a4),
  );
  pole.position.y = 3.6;
  g.add(pole);
  return g;
}

function createFoodCart() {
  const g = new THREE.Group();
  g.name = 'FoodCart';
  const fallback = createProceduralFoodCart();
  g.add(fallback);

  loadFoodCartTemplate().then((template) => {
    if (!template) {
      console.warn('[food-cart] GLB failed to load; keeping procedural cart');
      return;
    }
    g.remove(fallback);
    disposeObject3D(fallback);
    const cart = normalizeProp(template, 5.5);
    g.add(cart);
  });

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
  curb.scale.set(1, rzScale, 0.3);
  curb.position.y = 0.18;
  curb.castShadow = true;
  group.add(curb);

  // Path above grass; abut radii so rings don't share a coplanar band (z-fight / blink)
  const pathOuter = pathRx + 14;
  const path = createEllipseRingMesh(rx + 3.2, pathOuter, rzScale, createPaperMaterial(PALETTE.stonePath), 0.06);
  group.add(path);

  const grass = createEllipseRingMesh(pathOuter + 0.4, rx + 100, rzScale, createPaperMaterial(0xb5c99a), 0);
  group.add(grass);

  // Wood dock on south shore (−Z): pier local −Z → rotate so pier points into lake (+Z toward center)
  const dock = createWoodDock();
  const dockZ = -(rz + 4);
  dock.position.set(0, 0, dockZ);
  dock.rotation.y = Math.PI;
  group.add(dock);

  // White lighthouse beside the boathouse (land side of the pier)
  const lighthouse = createWhiteLighthouse();
  lighthouse.position.set(16, 0, dockZ - 8);
  group.add(lighthouse);

  // West-side island with woman statue (sim solid: echo_statue_island)
  const statueIsland = createStatueIsland();
  statueIsland.position.set(ECHO_STATUE_ISLAND.x, 0, ECHO_STATUE_ISLAND.z);
  group.add(statueIsland);

  // Swan boats near the south dock — positions driven by sim ambient physics
  for (let i = 0; i < 3; i++) {
    const swan = createSwanBoat();
    swan.userData.ambientId = `swan_${i}`;
    swan.userData.homeX = -14 + i * 14;
    swan.userData.homeZ = -(rz * 0.62);
    swan.userData.orbitR = 1.8;
    swan.userData.waterY = 0;
    swan.position.set(swan.userData.homeX, swan.userData.waterY, swan.userData.homeZ);
    swan.rotation.y = Math.PI * 0.15 * (i - 1);
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

  // Palms only around the shore (no Paris park trees / overhang sticks)
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.08;
    const p = ellipseOnRim(angle, rx + 36 + Math.random() * 24, rz + 32 + Math.random() * 22);
    const tree = createPalmTree();
    const s = 0.85 + Math.random() * 0.45;
    tree.scale.setScalar(s);
    tree.position.set(p.x, 0, p.z);
    tree.rotation.y = Math.random() * Math.PI * 2;
    group.add(tree);
  }

  // Food cart on the path near the center fountain (north-east shore)
  const cart = createFoodCart();
  const cartPos = ellipseOnRim(0.55, pathRx + 1.5, pathRz + 1.5);
  cart.position.set(cartPos.x, 0, cartPos.z);
  cart.rotation.y = 0.55 + Math.PI; // face the lake / fountain
  group.add(cart);

  // Mid-ground neighborhood blocks + distant downtown skyline
  group.add(createLaBackgroundBuildings(rx, rz));
  group.add(createLaSkyline(rx, rz));
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
    centerFountain = createEchoParkFountain();
    root.add(centerFountain);
  } else {
    scenery = createParkScenery(rx);
    centerFountain = createCenterFountain();
    root.add(centerFountain);
  }
  root.add(scenery);
  root.add(createFishSchools(rx, rz));
  root.add(createLakeDucks(rx, rz));

  return { root, waterMat, centerFountain, scenery };
}

/**
 * Animate ducks, fish, swans under a map world root.
 * @param {object[]|null} ambient - sim ambient boats ({ id, x, y, angle }); swans follow these when present
 */
export function updateMapAmbience(root, time, ambient = null) {
  if (!root) return;
  const ambientById = ambient
    ? Object.fromEntries(ambient.map((a) => [a.id, a]))
    : null;
  root.traverse((obj) => {
    const kind = obj.userData?.kind;
    if (!kind) return;
    const phase = obj.userData.phase || 0;
    const speed = obj.userData.speed || 0.2;
    const hx = obj.userData.homeX ?? obj.position.x;
    const hz = obj.userData.homeZ ?? obj.position.z;
    if (kind === 'swan') {
      const state = ambientById?.[obj.userData.ambientId];
      const waterY = obj.userData.waterY ?? 0;
      if (state) {
        obj.position.x = state.x;
        obj.position.z = state.y;
        obj.rotation.y = state.angle;
      } else {
        const r = (obj.userData.orbitR || 2) * 1.5;
        obj.position.x = hx + Math.cos(time * speed + phase) * r;
        obj.position.z = hz + Math.sin(time * speed + phase) * r;
        obj.rotation.y = time * speed + phase + Math.PI / 2;
      }
      obj.position.y = waterY + Math.sin(time * 2.5 + phase) * 0.06;
    } else if (kind === 'duck') {
      const prev = obj.userData.lastTime;
      const dt = prev == null ? 0.016 : Math.min(0.05, Math.max(0, time - prev));
      obj.userData.lastTime = time;
      stepDuckWander(obj, time, dt, { defaultSpeed: 1.2, turnScale: 1.8 });
      animateDuckHead(obj, time, dt);
    } else if (kind === 'duckFamily') {
      const prev = obj.userData.lastTime;
      const dt = prev == null ? 0.016 : Math.min(0.05, Math.max(0, time - prev));
      obj.userData.lastTime = time;
      stepDuckWander(obj, time, dt, { defaultSpeed: 1.5, turnScale: 1.2 });
      const mom = obj.userData.mom;
      if (mom) animateDuckHead(mom, time, dt);
      const babies = obj.userData.babies || [];
      babies.forEach((baby, i) => {
        // Keep a soft weaving line behind mom (local −X is aft)
        const targetZ = Math.sin(time * 2.2 + i * 0.9) * 0.18;
        baby.position.x = -(i + 1) * 1.05;
        baby.position.z += (targetZ - baby.position.z) * Math.min(1, dt * 4);
        baby.position.y = Math.sin(time * 3 + i) * 0.03;
        animateDuckHead(baby, time, dt);
      });
    } else if (kind === 'fish') {
      obj.position.x = hx + Math.cos(time * speed + phase) * 3;
      obj.position.z = hz + Math.sin(time * speed * 0.7 + phase) * 2;
      obj.material.opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 3 + phase));
    } else if (kind === 'fishSchool') {
      const prev = obj.userData.lastTime;
      const dt = prev == null ? 0.016 : Math.min(0.05, Math.max(0, time - prev));
      obj.userData.lastTime = time;

      obj.userData.turnTimer = (obj.userData.turnTimer ?? 2) - dt;
      if (obj.userData.turnTimer <= 0) {
        obj.userData.heading = (obj.userData.heading || 0) + (Math.random() - 0.5) * 1.8;
        obj.userData.turnTimer = 1.2 + Math.random() * 3.5;
        obj.userData.speed = 1.6 + Math.random() * 2.0;
      }

      const bRx = obj.userData.boundsRx || 70;
      const bRz = obj.userData.boundsRz || 70;
      const nx = obj.position.x / bRx;
      const nz = obj.position.z / bRz;
      if (nx * nx + nz * nz > 0.92) {
        obj.userData.heading = Math.atan2(-obj.position.z, -obj.position.x)
          + (Math.random() - 0.5) * 0.6;
        obj.userData.turnTimer = 1.5 + Math.random() * 2;
      }

      const heading = obj.userData.heading || 0;
      const spd = obj.userData.speed || 2;
      obj.position.x += Math.cos(heading) * spd * dt;
      obj.position.z += Math.sin(heading) * spd * dt;

      const baseDepth = obj.userData.baseDepth ?? -0.45;
      obj.position.y = baseDepth + Math.sin(time * 1.4 + phase) * 0.08;
      obj.rotation.y = heading;

      obj.children.forEach((fish, i) => {
        const wp = fish.userData.wigglePhase || 0;
        if (fish.userData.baseY == null) fish.userData.baseY = fish.position.y;
        fish.rotation.y = Math.sin(time * 8 + wp + i) * 0.25;
        fish.position.y = fish.userData.baseY + Math.sin(time * 5 + wp) * 0.05;
      });
    } else if (kind === 'balloonSalesman') {
      const bunch = obj.userData.bunch;
      if (bunch) {
        bunch.position.y = 3.4 + Math.sin(time * 1.6) * 0.12;
        bunch.rotation.y = Math.sin(time * 0.7) * 0.08;
      }
    }
  });
}
