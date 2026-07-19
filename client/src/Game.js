import * as THREE from 'three';
import { io } from 'socket.io-client';
import { PALETTE, createPaperMaterial, createWaterMaterial, setupLighting } from './StyleSystem.js';
import { createClassicFoldBoat, createCutterBoat, createGalleonBoat, createChildAvatar, createPushstick, createParkScenery, createObstacleMesh } from './Assets.js';

const INNER_PATH_RADIUS = 102;
const FOUNTAIN_RADIUS = 100;

export class Game {
  constructor() {
    this.socket = null;
    this.localId = null;
    this.playerAngle = Math.random() * Math.PI * 2;
    this.activeCameraMode = 'follow'; // 'follow' or 'fixed'
    
    // Customization selections
    this.customization = {
      boatType: 'standard',
      boatColor: '#ffb3ba',
      flagColor: '#baffc9',
      flagSymbol: 'star',
      stickType: 'wooden',
      stickColor: '#d7a15c'
    };

    // State collections
    this.playerState = {}; // { socketId: { angle, name, isPlaying } }
    this.boatsData = {}; // Raw state from server
    this.boatMeshes = {};
    this.avatarMeshes = {};
    this.pushstickMeshes = {};
    this.obstacleMeshes = {};
    this.wind = { angle: 0, speed: 5 };
    
    // Animation flags
    this.pokeAnimations = {}; // { socketId: timeElapsed }

    // Init ThreeJS
    this.initThree();
    this.initNetwork();
    this.bindUI();
    
    // Start loop
    this.animate();
  }

  initThree() {
    const container = document.getElementById('canvas-container');
    
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf6f3eb); // warm cardstock base background
    this.scene.fog = new THREE.FogExp2(0xf6f3eb, 0.0035);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Camera (Isometric perspective setup)
    this.camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 1, 1000);
    this.updateCameraPosition();

    // Lighting
    setupLighting(this.scene);

    // Water Surface mesh (large flat circle)
    const waterGeo = new THREE.CylinderGeometry(FOUNTAIN_RADIUS, FOUNTAIN_RADIUS, 0.2, 32);
    waterGeo.rotateX(Math.PI / 2);
    this.waterMat = createWaterMaterial();
    const water = new THREE.Mesh(waterGeo, this.waterMat);
    water.receiveShadow = true;
    water.position.y = 0.05; // Slightly above ground
    this.scene.add(water);

    // Ground, park trees, rims
    const scenery = createParkScenery(FOUNTAIN_RADIUS);
    this.scene.add(scenery);

    // Handle Resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  updateCameraPosition() {
    const targetY = 0;
    
    if (this.activeCameraMode === 'follow') {
      // Camera orbits with the player avatar on the rim
      const camAngle = this.playerAngle + Math.PI * 0.45; // slightly offset from behind
      const camDist = 55;
      const camHeight = 35;
      
      const px = Math.cos(this.playerAngle) * INNER_PATH_RADIUS;
      const pz = Math.sin(this.playerAngle) * INNER_PATH_RADIUS;
      
      const targetCamX = px + Math.cos(camAngle) * camDist;
      const targetCamZ = pz + Math.sin(camAngle) * camDist;
      
      // Interpolate camera smoothly
      this.camera.position.x += (targetCamX - this.camera.position.x) * 0.08;
      this.camera.position.y += (camHeight - this.camera.position.y) * 0.08;
      this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.08;
      
      // Look at the player avatar / boat area
      const lookTarget = new THREE.Vector3(px * 0.85, 2, pz * 0.85);
      this.camera.lookAt(lookTarget);
    } else {
      // Fixed overview looking down at the entire fountain from a distance
      const targetCamX = 0;
      const targetCamY = 110;
      const targetCamZ = 120;
      
      this.camera.position.x += (targetCamX - this.camera.position.x) * 0.05;
      this.camera.position.y += (targetCamY - this.camera.position.y) * 0.05;
      this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.05;
      
      this.camera.lookAt(new THREE.Vector3(0, 0, 0));
    }
  }

  initNetwork() {
    // Establish connection to Server
    // Default to local server port 3000
    const serverUrl = window.location.hostname === 'localhost' ? 'http://localhost:3005' : window.location.origin;
    this.socket = io(serverUrl);

    this.socket.on('connect', () => {
      this.localId = this.socket.id;
      console.log('Connected to server, Socket ID:', this.localId);
    });

    // Receive static obstacles setup from server
    this.socket.on('initGame', (data) => {
      // Clean up existing obstacles if any
      for (const id in this.obstacleMeshes) {
        this.scene.remove(this.obstacleMeshes[id]);
      }
      this.obstacleMeshes = {};

      // Spawn new obstacles
      data.obstacles.forEach((obs) => {
        const mesh = createObstacleMesh(obs.type, obs.radius);
        mesh.position.set(obs.x, mesh.position.y, obs.y);
        this.scene.add(mesh);
        this.obstacleMeshes[obs.id] = mesh;
      });
    });

    // Another player joined
    this.socket.on('playerJoined', (data) => {
      this.playerState[data.id] = {
        angle: data.playerAngle,
        isPlaying: true,
        customization: data.boat.customization
      };
      this.spawnPlayerVisuals(data.id, data.playerAngle, data.boat);
    });

    // Update coordinates and physics from server broadcast
    this.socket.on('stateUpdate', (data) => {
      this.wind = data.wind;
      this.updateWindVaneHUD();

      data.boats.forEach((boatUpdate) => {
        const id = boatUpdate.id;
        
        // Cache boat positions for interpolation
        this.boatsData[id] = boatUpdate;

        // If it's our boat, update HUD damage bar
        if (id === this.localId) {
          const dmgBar = document.getElementById('damage-bar');
          if (dmgBar) {
            dmgBar.style.width = `${boatUpdate.damage}%`;
            // Change progress bar color based on condition
            if (boatUpdate.damage > 50) {
              dmgBar.style.background = 'linear-gradient(90deg, #a8e6cf, #dcedc1)';
            } else if (boatUpdate.damage > 20) {
              dmgBar.style.background = 'linear-gradient(90deg, #ffd3b6, #ffaaa5)';
            } else {
              dmgBar.style.background = 'linear-gradient(90deg, #ff8b94, #ff6b6b)';
            }
          }

          // Handle Game Over / Sinking Screen
          if (boatUpdate.isSunk) {
            document.getElementById('sink-screen').classList.add('active');
          } else {
            document.getElementById('sink-screen').classList.remove('active');
          }
        }
      });
    });

    // Another player moved their child avatar
    this.socket.on('playerMoved', (data) => {
      if (this.playerState[data.id]) {
        this.playerState[data.id].angle = data.angle;
      }
    });

    // Boat poked trigger (start poke animation)
    this.socket.on('boatPoked', (data) => {
      this.pokeAnimations[data.id] = 0; // Trigger animation timer
    });

    // Boat respawned / repaired
    this.socket.on('boatRespawned', (data) => {
      if (this.boatMeshes[data.id]) {
        this.boatsData[data.id] = data.boat;
        this.boatMeshes[data.id].position.set(data.boat.x, 0, data.boat.y);
        this.boatMeshes[data.id].rotation.y = data.boat.angle;
        this.boatMeshes[data.id].scale.set(0.8, 0.8, 0.8); // Reset scale in case it shrunk
      }
    });

    // Player disconnected
    this.socket.on('playerLeft', (data) => {
      this.cleanPlayerVisuals(data.id);
      delete this.playerState[data.id];
      delete this.boatsData[data.id];
    });
  }

  spawnPlayerVisuals(id, angle, boatData) {
    this.cleanPlayerVisuals(id);

    const isLocal = (id === this.localId);
    const custom = boatData.customization;

    // 1. Spawn Boat Mesh
    let boatMesh;
    if (custom.boatType === 'cutter') {
      boatMesh = createCutterBoat(custom.boatColor, custom.flagColor, custom.flagSymbol);
    } else if (custom.boatType === 'pirate') {
      boatMesh = createGalleonBoat(custom.boatColor, custom.flagColor, custom.flagSymbol);
    } else {
      boatMesh = createClassicFoldBoat(custom.boatColor, custom.flagColor, custom.flagSymbol);
    }
    
    boatMesh.position.set(boatData.x, 0, boatData.y);
    boatMesh.rotation.y = boatData.angle;
    this.scene.add(boatMesh);
    this.boatMeshes[id] = boatMesh;

    // 2. Spawn Child Avatar
    const avatarColor = isLocal ? 0xffdfd0 : 0xe6caa4; // Slight skins variation
    const avatar = createChildAvatar(avatarColor);
    
    // Position child on the walking path
    const px = Math.cos(angle) * INNER_PATH_RADIUS;
    const pz = Math.sin(angle) * INNER_PATH_RADIUS;
    avatar.position.set(px, 0.05, pz);
    
    // Face the fountain center
    avatar.lookAt(new THREE.Vector3(0, 0, 0));
    this.scene.add(avatar);
    this.avatarMeshes[id] = avatar;

    // 3. Spawn Pushstick
    const pushstick = createPushstick(custom.stickType, custom.stickColor);
    pushstick.position.copy(avatar.position);
    pushstick.position.y = 1.0; // hand height
    pushstick.lookAt(boatMesh.position);
    this.scene.add(pushstick);
    this.pushstickMeshes[id] = pushstick;
  }

  cleanPlayerVisuals(id) {
    if (this.boatMeshes[id]) {
      this.scene.remove(this.boatMeshes[id]);
      delete this.boatMeshes[id];
    }
    if (this.avatarMeshes[id]) {
      this.scene.remove(this.avatarMeshes[id]);
      delete this.avatarMeshes[id];
    }
    if (this.pushstickMeshes[id]) {
      this.scene.remove(this.pushstickMeshes[id]);
      delete this.pushstickMeshes[id];
    }
  }

  bindUI() {
    // 1. Boat Selection Clickers
    document.querySelectorAll('#boat-options .option-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        document.querySelectorAll('#boat-options .option-card').forEach((c) => c.classList.remove('active'));
        const el = e.currentTarget;
        el.classList.add('active');
        this.customization.boatType = el.dataset.boat;
      });
    });

    // 2. Pushstick Selection Clickers
    document.querySelectorAll('#stick-options .option-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        document.querySelectorAll('#stick-options .option-card').forEach((c) => c.classList.remove('active'));
        const el = e.currentTarget;
        el.classList.add('active');
        this.customization.stickType = el.dataset.stick;
      });
    });

    // 3. Color pickers
    const boatColorEl = document.getElementById('boat-color');
    const flagColorEl = document.getElementById('flag-color');
    boatColorEl.addEventListener('input', (e) => {
      this.customization.boatColor = e.target.value;
    });
    flagColorEl.addEventListener('input', (e) => {
      this.customization.flagColor = e.target.value;
    });

    // 4. Flag symbols
    document.querySelectorAll('#symbol-options .symbol-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#symbol-options .symbol-btn').forEach((b) => b.classList.remove('active'));
        const el = e.currentTarget;
        el.classList.add('active');
        this.customization.flagSymbol = el.dataset.symbol;
      });
    });

    // 5. Play Button Click
    document.getElementById('btn-play').addEventListener('click', () => {
      document.getElementById('start-screen').classList.remove('active');
      document.getElementById('hud').classList.add('active');

      // Join game through websocket
      this.socket.emit('joinGame', this.customization);
    });

    // 6. Camera View Toggle Click
    document.getElementById('btn-camera-toggle').addEventListener('click', () => {
      this.activeCameraMode = this.activeCameraMode === 'follow' ? 'fixed' : 'follow';
    });

    // 7. Respawn Button Click
    document.getElementById('btn-respawn').addEventListener('click', () => {
      this.socket.emit('respawnBoat');
      document.getElementById('sink-screen').classList.remove('active');
    });

    // 8. Key events for player movement
    window.addEventListener('keydown', (e) => {
      if (document.getElementById('start-screen').classList.contains('active')) return;
      
      const speed = 0.04;
      if (e.key === 'a' || e.key === 'ArrowLeft') {
        this.playerAngle -= speed;
        this.onPlayerMove();
      } else if (e.key === 'd' || e.key === 'ArrowRight') {
        this.playerAngle += speed;
        this.onPlayerMove();
      } else if (e.key === ' ') {
        // Spacebar triggers poke
        this.socket.emit('pokeBoat');
      }
    });

    // 9. Pointer drag for walking around fountain
    let isDragging = false;
    window.addEventListener('pointerdown', (e) => {
      if (document.getElementById('start-screen').classList.contains('active')) return;
      if (e.target.closest('#hud') || e.target.closest('#sink-screen')) return;
      
      isDragging = true;
      this.handlePointerMove(e);
    });

    window.addEventListener('pointermove', (e) => {
      if (isDragging) this.handlePointerMove(e);
    });

    window.addEventListener('pointerup', () => {
      isDragging = false;
    });

    // Double click / tap inside the scene pokes the boat
    window.addEventListener('dblclick', (e) => {
      if (document.getElementById('start-screen').classList.contains('active')) return;
      if (e.target.closest('#hud') || e.target.closest('#sink-screen')) return;
      
      this.socket.emit('pokeBoat');
    });
  }

  handlePointerMove(e) {
    // Raycast to find click coordinates on ground plane
    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    
    // Intersect with water/ground plane at y=0
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const targetPoint = new THREE.Vector3();
    
    if (raycaster.ray.intersectPlane(plane, targetPoint)) {
      // Calculate angle from center
      const angle = Math.atan2(targetPoint.z, targetPoint.x);
      
      // Update local angle and sync with server
      this.playerAngle = angle;
      this.onPlayerMove();
    }
  }

  onPlayerMove() {
    // Keep angle normalized
    while (this.playerAngle < 0) this.playerAngle += Math.PI * 2;
    while (this.playerAngle > Math.PI * 2) this.playerAngle -= Math.PI * 2;

    this.socket.emit('movePlayer', { angle: this.playerAngle });
  }

  updateWindVaneHUD() {
    const arrow = document.getElementById('wind-vane-arrow');
    const speed = document.getElementById('wind-speed');
    if (arrow && speed) {
      // Translate wind angle to degrees for rotation (compensating for isometric look)
      const degrees = (this.wind.angle * 180) / Math.PI;
      arrow.style.transform = `rotate(${degrees}deg)`;
      speed.textContent = `${this.wind.speed.toFixed(1)} kn`;
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const time = clock.getElapsedTime();

    // 1. Water procedural ripple animation (low poly facet wobble)
    if (this.waterMat) {
      // Gentle shift in material shininess to represent sun glinting on paper
      this.waterMat.roughness = 0.2 + Math.sin(time) * 0.05;
    }

    // 2. Interpolate boat positions and animate them floating/bobbing
    for (const id in this.boatsData) {
      const data = this.boatsData[id];
      const mesh = this.boatMeshes[id];
      
      if (mesh) {
        if (data.isSunk) {
          // Slowly sink the boat mesh below water line and shrink it
          mesh.position.y += (-1.5 - mesh.position.y) * 0.05;
          mesh.scale.x += (0.01 - mesh.scale.x) * 0.05;
          mesh.scale.y += (0.01 - mesh.scale.y) * 0.05;
          mesh.scale.z += (0.01 - mesh.scale.z) * 0.05;
        } else {
          // Bobbing physics
          const bobHeight = Math.sin(time * 2.5 + id.charCodeAt(0)) * 0.06;
          const tiltX = Math.cos(time * 1.5 + id.charCodeAt(0)) * 0.03;
          const tiltZ = Math.sin(time * 1.2 + id.charCodeAt(0)) * 0.03;

          // Smoothly lerp towards server coordinates
          mesh.position.x += (data.x - mesh.position.x) * 0.15;
          mesh.position.y += (bobHeight - mesh.position.y) * 0.15;
          mesh.position.z += (data.y - mesh.position.z) * 0.15;

          // Heading angle lerping
          let angleDiff = data.angle - mesh.rotation.y;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          mesh.rotation.y += angleDiff * 0.15;

          // Apply slight sailing listing/tilting
          mesh.rotation.x = tiltX;
          mesh.rotation.z = tiltZ;
        }
      }
    }

    // 3. Interpolate and orient other players child avatars
    for (const id in this.playerState) {
      const state = this.playerState[id];
      const avatar = this.avatarMeshes[id];
      const boat = this.boatMeshes[id];
      const stick = this.pushstickMeshes[id];

      if (avatar) {
        // Find path coordinate
        const targetX = Math.cos(state.angle) * INNER_PATH_RADIUS;
        const targetZ = Math.sin(state.angle) * INNER_PATH_RADIUS;

        // Smoothly move avatar to the target point
        avatar.position.x += (targetX - avatar.position.x) * 0.2;
        avatar.position.z += (targetZ - avatar.position.z) * 0.2;
        avatar.position.y = 0.05;

        // Make avatar look at their boat
        if (boat) {
          avatar.lookAt(boat.position.x, avatar.position.y, boat.position.z);
        } else {
          avatar.lookAt(0, 0, 0); // look center
        }

        // 4. Animate pushstick
        if (stick) {
          // Anchor stick at hand height
          stick.position.x = avatar.position.x;
          stick.position.z = avatar.position.z;
          stick.position.y = 1.0; 

          if (boat) {
            // Face the boat
            stick.lookAt(boat.position.x, 1.0, boat.position.z);

            // Verify if there is a poke animation playing for this socket
            if (this.pokeAnimations[id] !== undefined) {
              const animProgress = this.pokeAnimations[id];
              this.pokeAnimations[id] += 0.08; // advance animation

              // Sine wave curve to extend stick forward and retreat back (0 to Math.PI)
              const extendDist = Math.sin(animProgress * Math.PI) * 1.5;
              
              // Scale pushstick length during the push
              stick.scale.set(1.0, 1.0, 1.0 + extendDist);

              if (animProgress >= 1.0) {
                delete this.pokeAnimations[id]; // finished
              }
            } else {
              stick.scale.set(1.0, 1.0, 1.0); // Reset scale
            }
          }
        }
      }
    }

    // 5. Update local camera position based on layout view selection
    this.updateCameraPosition();

    // Render scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Global clock for helper animations
const clock = new THREE.Clock();
