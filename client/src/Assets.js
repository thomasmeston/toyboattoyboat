import * as THREE from 'three';
import { createPaperMaterial, PALETTE } from './StyleSystem.js';

// Procedural geometry creators for papercraft assets

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

  // The long handle
  const handleGeo = new THREE.CylinderGeometry(0.08, 0.08, 12, 6);
  handleGeo.rotateX(Math.PI / 2); // align along Z-axis
  const handleMat = createPaperMaterial(stickColorCode);
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.castShadow = true;
  group.add(handle);

  // Head piece (e.g. Y-shaped fork or padded brass tip)
  let headGeo;
  if (stickType === 'wooden') {
    // Y-shaped fork made of cardboard boxy parts
    headGeo = new THREE.TorusGeometry(0.4, 0.08, 4, 8, Math.PI);
    headGeo.rotateX(Math.PI / 2);
  } else {
    // Elegant knob/brass end
    headGeo = new THREE.SphereGeometry(0.22, 6, 6);
  }
  const head = new THREE.Mesh(headGeo, handleMat);
  head.position.set(0, 0, 6.0); // At the tip of the 12-unit stick
  head.castShadow = true;
  group.add(head);

  return group;
}

// 6. Parisian Park Scenery (Static Fountain, Rim & Path)
export function createParkScenery(fountainRadius) {
  const group = new THREE.Group();

  // Fountain Outer Rim (thick paper polygon stone edge)
  const rimGeo = new THREE.RingGeometry(fountainRadius, fountainRadius + 2.5, 32);
  rimGeo.rotateX(-Math.PI / 2);
  
  // Extrude slightly to give it 3D depth like a raised cardstock rim
  const rimMeshGeo = new THREE.TorusGeometry(fountainRadius + 1.25, 1.25, 4, 48);
  rimMeshGeo.rotateX(Math.PI / 2);
  rimMeshGeo.scale(1, 0.4, 1); // squish vertically
  const rimMat = createPaperMaterial(PALETTE.fountainRim);
  const rim = new THREE.Mesh(rimMeshGeo, rimMat);
  rim.position.y = 0.25;
  rim.receiveShadow = true;
  rim.castShadow = true;
  group.add(rim);

  // Cobblestone path surrounding fountain where kids walk
  const pathGeo = new THREE.RingGeometry(fountainRadius + 2.5, fountainRadius + 15, 32);
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

  // Add stylized papercraft trees around the park
  const treeCount = 18;
  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 + Math.random() * 0.2;
    const distance = fountainRadius + 28 + Math.random() * 20;
    const tree = createPaperTree();
    tree.position.set(
      Math.cos(angle) * distance,
      0,
      Math.sin(angle) * distance
    );
    group.add(tree);
  }

  return group;
}

// Stylized origami cone tree
function createPaperTree() {
  const group = new THREE.Group();

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 3.0, 5);
  const trunkMat = createPaperMaterial(0x8a7050); // clay brown paper trunk
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.5;
  trunk.castShadow = true;
  group.add(trunk);

  // Foliage: 3 stacked cones (origami style)
  const foliageColors = [PALETTE.foliageDark, PALETTE.foliageLight];
  const color = foliageColors[Math.floor(Math.random() * foliageColors.length)];

  for (let i = 0; i < 3; i++) {
    const scale = 1.0 - i * 0.2;
    const foliageGeo = new THREE.ConeGeometry(2.2 * scale, 3.0 * scale, 5);
    const foliageMat = createPaperMaterial(color);
    const cone = new THREE.Mesh(foliageGeo, foliageMat);
    cone.position.y = 3.5 + i * 1.5 * scale;
    cone.castShadow = true;
    group.add(cone);
  }

  const randomScale = 0.8 + Math.random() * 0.5;
  group.scale.set(randomScale, randomScale, randomScale);
  return group;
}

// 7. Obstacle Mesh Factory
export function createObstacleMesh(type, radius) {
  let mesh;
  if (type === 'rock') {
    // Faceted cardboard rock
    const geo = new THREE.DodecahedronGeometry(radius, 0); // No details = flat panels
    const mat = createPaperMaterial(PALETTE.obstacleRock);
    
    // Perturb vertices slightly for custom handcrafted feel
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (Math.random() - 0.5) * 0.3;
      const y = pos.getY(i) + (Math.random() - 0.5) * 0.3;
      const z = pos.getZ(i) + (Math.random() - 0.5) * 0.3;
      pos.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();

    mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = radius * 0.5; // sit on water surface
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
