import * as THREE from 'three';

// Procedural paper grain canvas texture generator
let paperTextureInstance = null;

export function getPaperTexture() {
  if (paperTextureInstance) return paperTextureInstance;

  // Create a canvas to generate a paper fiber bump map
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Fill with mid-gray base
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add random paper fibers (fine lines and noise)
  ctx.strokeStyle = '#8c8c8c';
  ctx.lineWidth = 1;
  for (let i = 0; i < 400; i++) {
    ctx.beginPath();
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const len = 2 + Math.random() * 8;
    const angle = Math.random() * Math.PI * 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  // Add fine noise grains
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 12;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  // Create THREE texture
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4); // Tile the texture
  paperTextureInstance = texture;

  return paperTextureInstance;
}

// Pastel Palette reminiscent of "Untitled Goose Game"
export const PALETTE = {
  water: 0xa8d3e6,      // soft sky water blue
  stonePath: 0xe8e4d9,  // warm cream cobblestone
  fountainRim: 0xd9d2c5, // slightly darker warm gray
  grass: 0xc1d5a4,      // dusty pastel grass green
  foliageDark: 0x8aa882, // muted leaf green
  foliageLight: 0xa9c39f,// bright papercraft leaf green
  woodStick: 0xd2b48c,  // natural light wood/branch
  brassStick: 0xe2c670, // soft pastel gold/brass
  ribbonStick: 0xfcb3ba,// pastel pink stick
  obstacleRock: 0xc4beb3, // soft gray-brown rock (legacy)
  islandSand: 0xe8d4a8, // miniature beach sand
  islandDirt: 0xc4a574, // earth under the grass cap
  islandGrass: 0xb5d3a5, // tiny turf
  lighthouseWhite: 0xf5f0e6,
  lighthouseRed: 0xe89b9b,
  lighthouseLight: 0xffe08a,
  obstacleLeaf: 0x93b793, // light leaf
  obstacleLily: 0xb5d3a5, // pastel green lilypad
  obstacleRingRed: 0xe85a5a,
  obstacleRingWhite: 0xf7f4ef,
  buildingCream: 0xe6dfd2, // distant Haussmann limestone
  buildingStone: 0xd4cdc0,
  buildingRoof: 0xb89b8a, // soft zinc / terracotta roof
  buildingAccent: 0xc9c2b4
};

// Create a ThreeJS material with papercraft characteristics
export function createPaperMaterial(colorCode) {
  const bumpMap = getPaperTexture();
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorCode),
    roughness: 0.95,       // very matte paper texture
    metalness: 0.0,        // no reflection
    bumpMap: bumpMap,
    bumpScale: 0.015,      // subtle texture definition
    shadowSide: THREE.DoubleSide
  });
}

// Flat fountain basin water
export function createWaterMaterial() {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.water,
    roughness: 0.28,
    metalness: 0.04,
    transparent: true,
    opacity: 0.82,
  });
}

// Configure scene lighting for clean soft paper shadows
export function setupLighting(scene) {
  // Ambient Light for soft general shadows
  const ambientLight = new THREE.AmbientLight(0xfffbf0, 0.7);
  scene.add(ambientLight);

  // Directional Light mimicking a warm afternoon sun
  const dirLight = new THREE.DirectionalLight(0xfffaed, 0.9);
  dirLight.position.set(60, 100, 40);
  dirLight.castShadow = true;
  
  // Shadow settings
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 250;
  
  const d = 120;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  dirLight.shadow.bias = -0.0005;

  scene.add(dirLight);
}
