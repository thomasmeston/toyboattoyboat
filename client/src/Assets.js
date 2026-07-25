import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createPaperMaterial, PALETTE } from './StyleSystem.js';
import { assetUrl } from './assetUrl.js';

// Procedural geometry creators for papercraft assets

/** "Lighthouse" — Poly by Google (CC-BY) https://poly.pizza/m/7H8is9jrGeB */

const LIGHTHOUSE_URL = assetUrl('models/lighthouse.glb');
let lighthouseTemplatePromise = null;

function loadLighthouseTemplate() {
  if (!lighthouseTemplatePromise) {
    lighthouseTemplatePromise = new Promise((resolve) => {
      new GLTFLoader().load(
        LIGHTHOUSE_URL,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => {
          console.warn('Lighthouse model failed to load:', err);
          resolve(null);
        },
      );
    });
  }
  return lighthouseTemplatePromise;
}

loadLighthouseTemplate();

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

// 1. Origami Paper Sailboat
export function createClassicFoldBoat(hullColor, flagColor, flagSymbol = 'star') {
  const group = new THREE.Group();

  // Create custom geometry for folded paper hull
  const hullGeometry = new THREE.BufferGeometry();
  
  // Vertices of a classic folded paper boat
  // Format: [x, y, z] - y is up in ThreeJS, x is length (bow to stern), z is width
  const vertices = new Float32Array([
    // Keel (bottom center line)
    0.0, -0.6, 0.0,      // 0: Center keel
    3.0, 0.0, 0.0,       // 1: Bow tip (front)
    -3.0, 0.0, 0.0,      // 2: Stern tip (back)
    
    // Port side rim (outer edge)
    0.0, 0.5, 1.2,       // 3: Port center rim
    2.0, 0.3, 0.4,       // 4: Port bow rim
    -2.0, 0.3, 0.4,      // 5: Port stern rim
    
    // Starboard side rim (outer edge)
    0.0, 0.5, -1.2,      // 6: Starboard center rim
    2.0, 0.3, -0.4,      // 7: Starboard bow rim
    -2.0, 0.3, -0.4,     // 8: Starboard stern rim

    // Triangular paper peaks (the folded inner flaps)
    0.0, 1.2, 0.0        // 9: Central mast peak
  ]);

  // Faces (indices of vertices forming triangles)
  const indices = [
    // Bottom Port
    0, 4, 1,
    0, 3, 4,
    0, 5, 3,
    0, 2, 5,

    // Bottom Starboard
    0, 1, 7,
    0, 7, 6,
    0, 6, 8,
    0, 8, 2,

    // Port Outer Flaps
    3, 1, 4,
    3, 5, 2,

    // Starboard Outer Flaps
    6, 7, 1,
    6, 2, 8,

    // Central Triangular Sails (Double sided, fold lines visible)
    3, 9, 1,
    6, 1, 9,
    3, 2, 9,
    6, 9, 2
  ];

  hullGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  hullGeometry.setIndex(indices);
  hullGeometry.computeVertexNormals();

  const hullMat = createPaperMaterial(hullColor);
  const hullMesh = new THREE.Mesh(hullGeometry, hullMat);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  group.add(hullMesh);

  // Add the paper flag mast & flag
  const mastGeo = new THREE.CylinderGeometry(0.04, 0.06, 2.5, 5);
  const mastMat = createPaperMaterial(0xebdcc3); // beige paper stick
  const mast = new THREE.Mesh(mastGeo, mastMat);
  mast.position.set(0.0, 1.2, 0.0);
  mast.castShadow = true;
  group.add(mast);

  // Triangular paper flag
  const flagGeo = new THREE.BufferGeometry();
  const flagVerts = new Float32Array([
    0.0, 2.4, 0.0,       // Mast connection top
    0.0, 1.8, 0.0,       // Mast connection bottom
    -0.8, 2.1, 0.0       // Flag tip blowing backwards
  ]);
  const flagIndices = [
    0, 1, 2,
    2, 1, 0  // Double-sided
  ];
  flagGeo.setAttribute('position', new THREE.BufferAttribute(flagVerts, 3));
  flagGeo.setIndex(flagIndices);
  flagGeo.computeVertexNormals();

  const flagMat = createPaperMaterial(flagColor);
  const flagMesh = new THREE.Mesh(flagGeo, flagMat);
  flagMesh.castShadow = true;
  group.add(flagMesh);

  // Add Flag Symbol (using canvas drawing mapped to texture for simplified geometric symbols)
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = flagColor;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 36px Arial';
  
  let symbolText = '★';
  if (flagSymbol === 'heart') symbolText = '♥';
  else if (flagSymbol === 'anchor') symbolText = '⚓';
  else if (flagSymbol === 'moon') symbolText = '☾';
  
  ctx.fillText(symbolText, 32, 32);

  const symbolTex = new THREE.CanvasTexture(canvas);
  const symbolMat = new THREE.MeshBasicMaterial({
    map: symbolTex,
    transparent: true,
    side: THREE.DoubleSide
  });
  
  // Tiny overlay card for flag symbol
  const symbolCardGeo = new THREE.PlaneGeometry(0.4, 0.4);
  const symbolCard = new THREE.Mesh(symbolCardGeo, symbolMat);
  symbolCard.position.set(-0.3, 2.1, 0.01);
  group.add(symbolCard);

  // Scale down the whole boat to fit the scale of fountain
  group.scale.set(0.8, 0.8, 0.8);
  return group;
}

// 2. Cutter Rig Paper Sailboat
export function createCutterBoat(hullColor, flagColor, flagSymbol = 'star') {
  const group = new THREE.Group();

  // Create hull: flat, triangular bottom, slab-sided (origami style)
  const hullGeo = new THREE.ConeGeometry(1.5, 4.5, 4);
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.scale(0.8, 0.5, 1.2);
  const hullMat = createPaperMaterial(hullColor);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0.1;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // Mast
  const mastGeo = new THREE.CylinderGeometry(0.05, 0.08, 3.2, 5);
  const mastMat = createPaperMaterial(0xebdcc3);
  const mast = new THREE.Mesh(mastGeo, mastMat);
  mast.position.set(0.3, 1.5, 0);
  mast.castShadow = true;
  group.add(mast);

  // Large mainsail (triangular paper fold)
  const mainSailGeo = new THREE.BufferGeometry();
  const mainSailVerts = new Float32Array([
    0.3, 3.0, 0.0,
    0.3, 0.6, 0.0,
    -1.5, 0.6, 0.0
  ]);
  const mainSailIndices = [0, 1, 2, 2, 1, 0];
  mainSailGeo.setAttribute('position', new THREE.BufferAttribute(mainSailVerts, 3));
  mainSailGeo.setIndex(mainSailIndices);
  mainSailGeo.computeVertexNormals();
  const sailMat = createPaperMaterial(0xffffff); // White paper sail
  const mainSail = new THREE.Mesh(mainSailGeo, sailMat);
  mainSail.castShadow = true;
  group.add(mainSail);

  // Jib sail (front sail)
  const jibGeo = new THREE.BufferGeometry();
  const jibVerts = new Float32Array([
    0.3, 2.5, 0.0,
    1.4, 0.6, 0.0,
    0.4, 0.6, 0.0
  ]);
  const jibIndices = [0, 1, 2, 2, 1, 0];
  jibGeo.setAttribute('position', new THREE.BufferAttribute(jibVerts, 3));
  jibGeo.setIndex(jibIndices);
  jibGeo.computeVertexNormals();
  const jib = new THREE.Mesh(jibGeo, sailMat);
  jib.castShadow = true;
  group.add(jib);

  // Tiny flag on top
  const flagGeo = new THREE.BufferGeometry();
  const flagVerts = new Float32Array([
    0.3, 3.2, 0.0,
    0.3, 2.8, 0.0,
    -0.2, 3.0, 0.0
  ]);
  const flagIndices = [0, 1, 2, 2, 1, 0];
  flagGeo.setAttribute('position', new THREE.BufferAttribute(flagVerts, 3));
  flagGeo.setIndex(flagIndices);
  flagGeo.computeVertexNormals();
  const flagMesh = new THREE.Mesh(flagGeo, createPaperMaterial(flagColor));
  flagMesh.castShadow = true;
  group.add(flagMesh);

  group.scale.set(0.8, 0.8, 0.8);
  return group;
}

// 3. Galleon Sailboat
export function createGalleonBoat(hullColor, flagColor, flagSymbol = 'star') {
  const group = new THREE.Group();

  // Wide boxy paper folded hull
  const hullGeo = new THREE.BoxGeometry(4.0, 1.0, 1.8);
  const hullMat = createPaperMaterial(hullColor);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = 0.3;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  // Elevated bow and stern castles (origami box style)
  const castleGeo = new THREE.BoxGeometry(1.0, 0.6, 1.8);
  const sternCastle = new THREE.Mesh(castleGeo, hullMat);
  sternCastle.position.set(-1.5, 0.8, 0);
  sternCastle.castShadow = true;
  group.add(sternCastle);

  const bowCastle = new THREE.Mesh(castleGeo, hullMat);
  bowCastle.position.set(1.5, 0.8, 0);
  bowCastle.castShadow = true;
  group.add(bowCastle);

  // Masts (three)
  const mastMat = createPaperMaterial(0xebdcc3);
  
  const mainMast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.5, 5), mastMat);
  mainMast.position.set(0, 1.8, 0);
  mainMast.castShadow = true;
  group.add(mainMast);

  const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.8, 5), mastMat);
  foreMast.position.set(1.0, 1.5, 0);
  foreMast.castShadow = true;
  group.add(foreMast);

  // Square sails
  const squareSailGeo = new THREE.PlaneGeometry(1.2, 1.8);
  const sailMat = createPaperMaterial(0xffffff);
  
  const mainSail1 = new THREE.Mesh(squareSailGeo, sailMat);
  mainSail1.position.set(0, 1.8, 0.1);
  mainSail1.rotation.y = Math.PI / 2; // Square sail facing forward
  mainSail1.castShadow = true;
  group.add(mainSail1);

  const foreSail = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), sailMat);
  foreSail.position.set(1.0, 1.5, 0.1);
  foreSail.rotation.y = Math.PI / 2;
  foreSail.castShadow = true;
  group.add(foreSail);

  // Flag on main mast
  const flagGeo = new THREE.PlaneGeometry(0.6, 0.4);
  const flag = new THREE.Mesh(flagGeo, createPaperMaterial(flagColor));
  flag.position.set(-0.35, 3.3, 0);
  flag.castShadow = true;
  group.add(flag);

  group.scale.set(0.8, 0.8, 0.8);
  return group;
}

// 4. Low-Poly Child Avatar
export function createChildAvatar(color = 0xffe0bd) {
  const group = new THREE.Group();

  // Body: low-poly cylinder coat
  const coatGeo = new THREE.CylinderGeometry(0.5, 0.8, 2.0, 6);
  const coatMat = createPaperMaterial(0xffd4b2); // Pastel peach coat
  const coat = new THREE.Mesh(coatGeo, coatMat);
  coat.position.y = 1.0;
  coat.castShadow = true;
  coat.receiveShadow = true;
  group.add(coat);

  // Head
  const headGeo = new THREE.SphereGeometry(0.4, 8, 8);
  const headMat = createPaperMaterial(color); // Skin tone
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 2.2;
  head.castShadow = true;
  group.add(head);

  // Paper Rain Hat (yellow cone)
  const hatGeo = new THREE.ConeGeometry(0.6, 0.5, 6);
  const hatMat = createPaperMaterial(0xffeb60); // Yellow slicker hat
  const hat = new THREE.Mesh(hatGeo, hatMat);
  hat.position.y = 2.5;
  hat.rotation.y = Math.PI / 6;
  hat.castShadow = true;
  group.add(hat);

  // Pushstick hand extensions (geometric arms)
  const armGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.2, 4);
  armGeo.rotateZ(Math.PI / 4);
  const armMat = createPaperMaterial(0xffd4b2);
  const arm = new THREE.Mesh(armGeo, armMat);
  arm.position.set(0.5, 1.2, 0.4);
  arm.castShadow = true;
  group.add(arm);

  return group;
}

// 5. Stylized Pushstick
export function createPushstick(stickType, color) {
  const group = new THREE.Group();
  
  // Choose stick color base
  let stickColorCode = PALETTE.woodStick;
  if (stickType === 'brass') stickColorCode = PALETTE.brassStick;
  else if (stickType === 'ribbon') stickColorCode = PALETTE.ribbonStick;

  // Handle along Z; tip on -Z so Object3D.lookAt aims the tip at the target
  const handleGeo = new THREE.CylinderGeometry(0.08, 0.08, 12, 6);
  handleGeo.rotateX(Math.PI / 2);
  const handleMat = createPaperMaterial(stickColorCode);
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.castShadow = true;
  group.add(handle);

  let headGeo;
  if (stickType === 'wooden') {
    headGeo = new THREE.TorusGeometry(0.4, 0.08, 4, 8, Math.PI);
    headGeo.rotateX(Math.PI / 2);
  } else {
    headGeo = new THREE.SphereGeometry(0.22, 6, 6);
  }
  const head = new THREE.Mesh(headGeo, handleMat);
  head.position.set(0, 0, -6.0);
  head.castShadow = true;
  group.add(head);

  return group;
}

// 6. Parisian Park Scenery (Static Fountain, Rim & Path)
/**
 * Papercraft park bench sized for ~5.5-unit child avatars.
 * Seat faces local +Z; use faceBenchTowardFountain() after placing.
 */
export function createParkBench() {
  const g = new THREE.Group();
  g.name = 'ParkBench';
  const wood = createPaperMaterial(PALETTE.benchWood);
  const iron = createPaperMaterial(0x5a5a5a);

  // Kid scale: sailors are TARGET_HEIGHT 5.5 — seat ~knee height, 2-kid width
  const seatW = 4.6;
  const seatD = 1.25;
  const seatY = 1.25;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.22, seatD), wood);
  seat.position.y = seatY;
  seat.castShadow = true;
  seat.receiveShadow = true;
  g.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(seatW, 1.15, 0.18), wood);
  back.position.set(0, seatY + 0.7, -seatD * 0.42);
  back.castShadow = true;
  g.add(back);

  for (const x of [-seatW * 0.38, seatW * 0.38]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, seatY, seatD * 0.85), iron);
    leg.position.set(x, seatY * 0.5, 0);
    leg.castShadow = true;
    g.add(leg);
  }

  // Armrests — read at hand height for a standing child
  for (const x of [-seatW * 0.48, seatW * 0.48]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, seatD * 0.9), wood);
    arm.position.set(x, seatY + 0.45, 0.05);
    arm.castShadow = true;
    g.add(arm);
  }

  return g;
}

/** Seat faces the fountain (local +Z → basin center). */
export function faceBenchTowardFountain(bench) {
  const { y } = bench.position;
  // lookAt aims local −Z at the target; backrest toward center → seat faces the water
  bench.lookAt(0, y, 0);
}

export function createParkScenery(fountainRadius) {
  const group = new THREE.Group();

  // Fountain Outer Rim (thick paper polygon stone edge)
  const rimOuter = fountainRadius + 3.8;
  const rimGeo = new THREE.RingGeometry(fountainRadius, rimOuter, 32);
  rimGeo.rotateX(-Math.PI / 2);
  
  // Extrude slightly to give it 3D depth like a raised cardstock rim
  const rimMeshGeo = new THREE.TorusGeometry(fountainRadius + 1.9, 1.55, 4, 48);
  rimMeshGeo.rotateX(Math.PI / 2);
  rimMeshGeo.scale(1, 0.4, 1); // squish vertically
  const rimMat = createPaperMaterial(PALETTE.fountainRim);
  const rim = new THREE.Mesh(rimMeshGeo, rimMat);
  rim.position.y = 0.25;
  rim.receiveShadow = true;
  rim.castShadow = true;
  group.add(rim);

  // Cobblestone path surrounding fountain where kids walk
  const pathGeo = new THREE.RingGeometry(rimOuter, fountainRadius + 16.5, 32);
  pathGeo.rotateX(-Math.PI / 2);
  const pathMat = createPaperMaterial(PALETTE.stonePath);
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.position.y = 0.01;
  path.receiveShadow = true;
  group.add(path);

  // Outer green grass tiles (folded paper sheet look)
  const grassGeo = new THREE.RingGeometry(fountainRadius + 15, fountainRadius + 80, 24);
  grassGeo.rotateX(-Math.PI / 2);
  const grassMat = createPaperMaterial(PALETTE.grass);
  const grass = new THREE.Mesh(grassGeo, grassMat);
  grass.position.y = 0.0;
  grass.receiveShadow = true;
  group.add(grass);

  // Park benches on the outer edge of the walk path, facing the basin
  // Path runs rimOuter → fountainRadius+16.5; walk radius ~104.5 — place just outside walk line
  const benchCount = 7;
  const benchDist = fountainRadius + 12.5;
  for (let i = 0; i < benchCount; i++) {
    const angle = (i / benchCount) * Math.PI * 2 + 0.08;
    const bench = createParkBench();
    bench.position.set(
      Math.cos(angle) * benchDist,
      0,
      Math.sin(angle) * benchDist,
    );
    faceBenchTowardFountain(bench);
    group.add(bench);
  }

  // Park trees — larger than the ~5.5-unit sailors, mixed silhouettes
  const treeCount = 26;
  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const distance = fountainRadius + 34 + Math.random() * 42;
    const tree = createParkTree();
    tree.position.set(
      Math.cos(angle) * distance,
      0,
      Math.sin(angle) * distance,
    );
    tree.rotation.y = Math.random() * Math.PI * 2;
    group.add(tree);
  }

  // A few closer landmark trees just outside the path
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + 0.2;
    const tree = createParkTree({ landmark: true });
    tree.position.set(
      Math.cos(angle) * (fountainRadius + 28 + Math.random() * 6),
      0,
      Math.sin(angle) * (fountainRadius + 28 + Math.random() * 6),
    );
    tree.rotation.y = Math.random() * Math.PI * 2;
    group.add(tree);
  }

  // Distant city blocks (sit in fog beyond the grass ring)
  group.add(createDistantBuildings(fountainRadius));

  return group;
}

/** Ring of soft papercraft Parisian blocks for ambient skyline. */
function createDistantBuildings(fountainRadius) {
  const group = new THREE.Group();
  group.name = 'DistantBuildings';

  const ringCount = 28;
  for (let i = 0; i < ringCount; i++) {
    const angle = (i / ringCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
    const distance = fountainRadius + 95 + Math.random() * 55;
    const block = createPaperBuildingBlock();
    block.position.set(
      Math.cos(angle) * distance,
      0,
      Math.sin(angle) * distance,
    );
    block.rotation.y = angle + Math.PI; // face toward park
    block.rotation.y += (Math.random() - 0.5) * 0.25;
    group.add(block);
  }

  // A few taller landmarks for silhouette variety
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.4;
    const distance = fountainRadius + 140 + Math.random() * 40;
    const tower = createPaperBuildingBlock({ tall: true });
    tower.position.set(
      Math.cos(angle) * distance,
      0,
      Math.sin(angle) * distance,
    );
    tower.rotation.y = angle + Math.PI;
    group.add(tower);
  }

  return group;
}

function createPaperBuildingBlock({ tall = false } = {}) {
  const group = new THREE.Group();

  const width = 10 + Math.random() * 14;
  const depth = 8 + Math.random() * 10;
  const floors = tall ? 8 + Math.floor(Math.random() * 5) : 3 + Math.floor(Math.random() * 4);
  const height = floors * (2.4 + Math.random() * 0.6);

  const bodyColors = [PALETTE.buildingCream, PALETTE.buildingStone, PALETTE.buildingAccent];
  const bodyColor = bodyColors[Math.floor(Math.random() * bodyColors.length)];

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    createPaperMaterial(bodyColor),
  );
  body.position.y = height * 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Mansard / zinc roof slab
  const roofH = 1.6 + Math.random() * 1.2;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width * 1.02, roofH, depth * 1.02),
    createPaperMaterial(PALETTE.buildingRoof),
  );
  roof.position.y = height + roofH * 0.45;
  roof.castShadow = true;
  group.add(roof);

  // Simple chimney accent on some blocks
  if (Math.random() > 0.45) {
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.2, 1.1),
      createPaperMaterial(PALETTE.buildingStone),
    );
    chimney.position.set(
      (Math.random() - 0.5) * width * 0.35,
      height + roofH + 0.8,
      (Math.random() - 0.5) * depth * 0.35,
    );
    chimney.castShadow = true;
    group.add(chimney);
  }

  // Optional second adjoining wing for denser skyline
  if (!tall && Math.random() > 0.55) {
    const wingW = width * (0.45 + Math.random() * 0.3);
    const wingH = height * (0.7 + Math.random() * 0.25);
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(wingW, wingH, depth * 0.85),
      createPaperMaterial(bodyColors[Math.floor(Math.random() * bodyColors.length)]),
    );
    wing.position.set(width * 0.55, wingH * 0.5, 0);
    wing.castShadow = true;
    group.add(wing);
  }

  const scale = 0.85 + Math.random() * 0.35;
  group.scale.set(scale, scale * (0.9 + Math.random() * 0.2), scale);
  return group;
}

/**
 * Stylized park trees sized for ~5.5-unit child avatars (roughly 2–4× sailor height).
 * Variants: pine, round canopy, tall poplar, wide umbrella.
 */
export function createParkTree({ landmark = false } = {}) {
  const group = new THREE.Group();
  const variants = ['pine', 'round', 'poplar', 'umbrella'];
  const variant = variants[Math.floor(Math.random() * variants.length)];
  const foliageColors = [
    PALETTE.foliageDark,
    PALETTE.foliageLight,
    0x7a9e6e,
    0x5f8a58,
    0x8fb37a,
  ];
  const trunkColors = [0x8a7050, 0x6e5640, 0x9a8060, 0x5c4636];
  const foliageColor = foliageColors[Math.floor(Math.random() * foliageColors.length)];
  const trunkColor = trunkColors[Math.floor(Math.random() * trunkColors.length)];
  const trunkMat = createPaperMaterial(trunkColor);
  const foliageMat = createPaperMaterial(foliageColor);

  if (variant === 'pine') {
    const trunkH = 5.5 + Math.random() * 3.5;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.7, trunkH, 6),
      trunkMat,
    );
    trunk.position.y = trunkH * 0.5;
    trunk.castShadow = true;
    group.add(trunk);

    const tiers = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < tiers; i++) {
      const t = i / Math.max(1, tiers - 1);
      const r = (3.8 - t * 2.2) * (0.85 + Math.random() * 0.25);
      const h = (4.2 - t * 0.8) * (0.9 + Math.random() * 0.2);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), foliageMat);
      cone.position.y = trunkH * 0.55 + i * (h * 0.55);
      cone.rotation.y = Math.random() * 0.6;
      cone.castShadow = true;
      group.add(cone);
    }
  } else if (variant === 'round') {
    const trunkH = 4.2 + Math.random() * 2.4;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.75, trunkH, 6),
      trunkMat,
    );
    trunk.position.y = trunkH * 0.5;
    trunk.castShadow = true;
    group.add(trunk);

    const canopyR = 3.6 + Math.random() * 2.2;
    const canopy = new THREE.Mesh(
      new THREE.IcosahedronGeometry(canopyR, 0),
      foliageMat,
    );
    canopy.position.y = trunkH + canopyR * 0.55;
    canopy.scale.set(1.15, 0.85 + Math.random() * 0.25, 1.1);
    canopy.castShadow = true;
    group.add(canopy);

    if (Math.random() > 0.45) {
      const puff = new THREE.Mesh(
        new THREE.IcosahedronGeometry(canopyR * 0.55, 0),
        createPaperMaterial(foliageColors[Math.floor(Math.random() * foliageColors.length)]),
      );
      puff.position.set(
        (Math.random() - 0.5) * canopyR * 0.7,
        trunkH + canopyR * 0.35,
        (Math.random() - 0.5) * canopyR * 0.7,
      );
      puff.castShadow = true;
      group.add(puff);
    }
  } else if (variant === 'poplar') {
    const trunkH = 8 + Math.random() * 4;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.55, trunkH, 5),
      trunkMat,
    );
    trunk.position.y = trunkH * 0.5;
    trunk.castShadow = true;
    group.add(trunk);

    const layers = 4 + Math.floor(Math.random() * 2);
    for (let i = 0; i < layers; i++) {
      const t = i / Math.max(1, layers - 1);
      const r = 1.4 + (1 - t) * 1.1;
      const h = 3.2 + Math.random() * 0.8;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), foliageMat);
      cone.position.y = trunkH * 0.35 + i * (h * 0.62);
      cone.castShadow = true;
      group.add(cone);
    }
  } else {
    // umbrella — broad flat canopy
    const trunkH = 5 + Math.random() * 2.5;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.65, trunkH, 6),
      trunkMat,
    );
    trunk.position.y = trunkH * 0.5;
    trunk.castShadow = true;
    group.add(trunk);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(4.2 + Math.random() * 1.6, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
      foliageMat,
    );
    canopy.position.y = trunkH + 0.4;
    canopy.scale.set(1.35, 0.55, 1.35);
    canopy.castShadow = true;
    group.add(canopy);
  }

  // Target world height ~11–22 (≈2–4× sailor) so trunks read at park scale
  const targetH = landmark
    ? 18 + Math.random() * 6
    : 12 + Math.random() * 8;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const s = targetH / Math.max(size.y, 0.01);
  group.scale.setScalar(s);
  // Slight non-uniform lean for organic feel
  group.scale.x *= 0.92 + Math.random() * 0.16;
  group.scale.z *= 0.92 + Math.random() * 0.16;
  return group;
}

/** @deprecated use createParkTree */
function createPaperTree() {
  return createParkTree();
}

/** Papercraft miniature island; optional tiny lighthouse. */
function createMiniatureIsland(radius, { withLighthouse = false } = {}) {
  const group = new THREE.Group();
  group.name = withLighthouse ? 'IslandLighthouse' : 'Island';

  const sandMat = createPaperMaterial(PALETTE.islandSand);
  const dirtMat = createPaperMaterial(PALETTE.islandDirt);
  const grassMat = createPaperMaterial(PALETTE.islandGrass);

  // Low sandy mound
  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    sandMat,
  );
  mound.scale.set(1.15, 0.45, 1.0);
  mound.position.y = 0.05;
  mound.castShadow = true;
  mound.receiveShadow = true;
  group.add(mound);

  // Earth ring under the turf
  const dirt = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.78, radius * 0.95, radius * 0.35, 10),
    dirtMat,
  );
  dirt.position.y = radius * 0.22;
  dirt.castShadow = true;
  group.add(dirt);

  // Grass cap
  const grass = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.72, radius * 0.8, radius * 0.22, 10),
    grassMat,
  );
  grass.position.y = radius * 0.42;
  grass.castShadow = true;
  group.add(grass);

  // A couple of papercraft shrub cones
  const shrubCount = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < shrubCount; i++) {
    const a = (i / shrubCount) * Math.PI * 2 + Math.random() * 0.4;
    const d = radius * (0.25 + Math.random() * 0.35);
    const s = radius * (0.18 + Math.random() * 0.14);
    const shrub = new THREE.Mesh(
      new THREE.ConeGeometry(s, s * 1.6, 5),
      createPaperMaterial(Math.random() > 0.5 ? PALETTE.foliageDark : PALETTE.foliageLight),
    );
    shrub.position.set(Math.cos(a) * d, radius * 0.55 + s * 0.5, Math.sin(a) * d);
    shrub.castShadow = true;
    group.add(shrub);
  }

  if (withLighthouse) {
    addProceduralLighthouse(group, radius);
  }

  group.rotation.y = Math.random() * Math.PI * 2;
  return group;
}

function addProceduralLighthouse(group, radius) {
  const towerH = radius * 1.35;
  const towerR = Math.max(0.35, radius * 0.14);
  const baseY = radius * 0.52;

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(towerR * 0.85, towerR, towerH, 8),
    createPaperMaterial(PALETTE.lighthouseWhite),
  );
  tower.position.y = baseY + towerH * 0.5;
  tower.castShadow = true;
  group.add(tower);

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(towerR * 0.9, towerR * 0.95, towerH * 0.22, 8),
    createPaperMaterial(PALETTE.lighthouseRed),
  );
  band.position.y = baseY + towerH * 0.55;
  band.castShadow = true;
  group.add(band);

  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(towerR * 1.15, towerR * 1.05, towerH * 0.18, 8),
    createPaperMaterial(PALETTE.lighthouseWhite),
  );
  lantern.position.y = baseY + towerH + towerH * 0.08;
  lantern.castShadow = true;
  group.add(lantern);

  const light = new THREE.Mesh(
    new THREE.SphereGeometry(towerR * 0.55, 8, 6),
    new THREE.MeshStandardMaterial({
      color: PALETTE.lighthouseLight,
      emissive: PALETTE.lighthouseLight,
      emissiveIntensity: 0.85,
      roughness: 0.4,
    }),
  );
  light.position.y = baseY + towerH + towerH * 0.08;
  group.add(light);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(towerR * 1.35, towerH * 0.35, 8),
    createPaperMaterial(PALETTE.lighthouseRed),
  );
  roof.position.y = baseY + towerH + towerH * 0.28;
  roof.castShadow = true;
  group.add(roof);
}

async function createLighthouseIsland(radius) {
  const group = createMiniatureIsland(radius, { withLighthouse: false });
  group.name = 'IslandLighthouse';

  const template = await loadLighthouseTemplate();
  if (!template) {
    addProceduralLighthouse(group, radius);
    return group;
  }

  const model = template.clone(true);
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const targetHeight = radius * 0.8; // ~3× smaller than the original island-scale tower
  const box = meshBounds(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = targetHeight / Math.max(size.y, 0.001);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const grounded = meshBounds(model);
  const center = grounded.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  // Sit on the grass cap of the miniature island
  model.position.y = radius * 0.52 - grounded.min.y;

  group.add(model);
  return group;
}

function createScoringRing(radius, facing = 0) {
  const group = new THREE.Group();
  const tube = Math.max(0.22, radius * 0.16);
  const stripes = 14;
  const arc = (Math.PI * 2) / stripes;
  const redMat = createPaperMaterial(0xe85a5a);
  const whiteMat = createPaperMaterial(0xf7f4ef);
  const ring = new THREE.Group();

  for (let i = 0; i < stripes; i++) {
    const seg = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 6, 7, arc * 0.94),
      i % 2 === 0 ? redMat : whiteMat,
    );
    seg.rotation.z = i * arc;
    seg.castShadow = true;
    ring.add(seg);
  }

  // Default torus is vertical (XY); align hole with sail-through facing
  ring.rotation.y = Math.PI / 2 - facing;
  ring.position.y = radius;
  group.add(ring);

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.8, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffd0d0,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.04;
  group.add(pad);

  return group;
}

// 7. Obstacle Mesh Factory (async — lighthouse loads a GLB)
export async function createObstacleMesh(type, radius, options = {}) {
  let mesh;
  if (type === 'ring') {
    mesh = createScoringRing(radius, options.facing ?? 0);
  } else if (type === 'lighthouse') {
    mesh = await createLighthouseIsland(radius);
  } else if (type === 'island' || type === 'rock') {
    mesh = createMiniatureIsland(radius, {
      withLighthouse: type === 'rock' && Math.random() < 0.35,
    });
  } else if (type === 'buoy') {
    // Red and white paper striped cone buoy
    mesh = new THREE.Group();
    const bottomGeo = new THREE.CylinderGeometry(radius, radius, 0.4, 6);
    const stripeMat1 = createPaperMaterial(0xff9494); // pastel red
    const stripeMat2 = createPaperMaterial(0xffffff); // white
    
    const base = new THREE.Mesh(bottomGeo, stripeMat1);
    base.position.y = 0.2;
    mesh.add(base);

    const coneGeo = new THREE.ConeGeometry(radius * 0.8, radius * 2, 6);
    const cone = new THREE.Mesh(coneGeo, stripeMat2);
    cone.position.y = radius;
    mesh.add(cone);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.2, 4, 4), stripeMat1);
    tip.position.y = radius * 2.0;
    mesh.add(tip);
  } else if (type === 'leaf') {
    // Folded green cardstock leaf
    mesh = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      0, 0.05, radius,        // front tip
      -radius*0.6, 0.1, 0,    // left crease
      0, 0, -radius,          // back stem
      radius*0.6, 0.1, 0      // right crease
    ]);
    const indices = [
      0, 1, 2,  // left half
      2, 3, 0,  // right half
      0, 2, 1,  // underside
      2, 0, 3
    ];
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    
    const leaf = new THREE.Mesh(geo, createPaperMaterial(PALETTE.obstacleLeaf));
    mesh.add(leaf);
  } else {
    // Lilypad: flat circle missing a sector
    mesh = new THREE.Group();
    const geo = new THREE.CylinderGeometry(radius, radius, 0.05, 12, 1, false, 0, Math.PI * 1.7);
    const pad = new THREE.Mesh(geo, createPaperMaterial(PALETTE.obstacleLily));
    pad.position.y = 0.02;
    mesh.add(pad);
  }

  // Set casts/receives shadows
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Papercraft windsock for a miniature island.
 * Sleeve tip points along local +X. Scene-parented roots should set
 * sleeve.rotation.y = −windAngle so +X aligns with sim wind (cos θ, sin θ) on XZ.
 */
export function createWindSock(islandRadius = 4) {
  const root = new THREE.Group();
  root.name = 'WindSock';

  const scale = Math.max(1.2, Math.min(1.8, islandRadius / 3.8));
  const poleH = 5.2 * scale;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09 * scale, 0.12 * scale, poleH, 6),
    createPaperMaterial(0xc4b8a4),
  );
  pole.position.y = poleH * 0.5;
  pole.castShadow = true;
  root.add(pole);

  const knuckle = new THREE.Mesh(
    new THREE.SphereGeometry(0.18 * scale, 6, 5),
    createPaperMaterial(0xb0a090),
  );
  knuckle.position.y = poleH;
  root.add(knuckle);

  // Pivot at top of pole — Game updates this.rotation.y from wind
  const sleeve = new THREE.Group();
  sleeve.name = 'WindSockSleeve';
  sleeve.position.y = poleH;
  root.add(sleeve);

  const stripes = [0xe85a5a, 0xf7f4ef, 0xe85a5a, 0xf7f4ef];
  const len = 3.4 * scale;
  const segments = stripes.length;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const r0 = (0.7 - t0 * 0.52) * scale;
    const r1 = (0.7 - t1 * 0.52) * scale;
    const segLen = len / segments;
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(r1, r0, segLen, 8),
      createPaperMaterial(stripes[i]),
    );
    // Default cylinder is +Y; lay along +X (downwind)
    cone.rotation.z = -Math.PI / 2;
    cone.position.x = segLen * 0.5 + i * segLen;
    cone.castShadow = true;
    sleeve.add(cone);
  }

  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.72 * scale, 0.06 * scale, 5, 12),
    createPaperMaterial(0xd8d0c4),
  );
  mouth.rotation.y = Math.PI / 2;
  mouth.position.x = 0.02;
  sleeve.add(mouth);

  root.userData.sleeve = sleeve;
  root.userData.poleHeight = poleH;
  return root;
}
