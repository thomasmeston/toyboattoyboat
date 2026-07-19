import * as THREE from 'three';
import { io } from 'socket.io-client';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { createWaterMaterial, setupLighting } from './StyleSystem.js';
import { createPushstick, createParkScenery, createObstacleMesh } from './Assets.js';
import { createAnimatedChildAvatar } from './ChildAvatar.js';
import { createWoodBoat } from './BoatModels.js';
import { createCenterFountain, updateCenterFountain } from './FountainCenter.js';
import { BackgroundMusic } from './BackgroundMusic.js';
import { startMenuPreviews } from './MenuPreviews.js';

const INNER_PATH_RADIUS = 102;
const FOUNTAIN_RADIUS = 100;
const WALK_SPEED = 0.006; // rad per frame-unit when holding A/D

export class Game {
  constructor() {
    this.socket = null;
    this.localId = null;
    this.playerAngle = Math.random() * Math.PI * 2;
    this.activeCameraMode = 'follow'; // 'follow' | 'followBoat' | 'overview'
    this._cameraModes = ['follow', 'followBoat', 'overview'];
    this.menuOpen = false;
    this.music = new BackgroundMusic();

    // Orbit / zoom around the local player (follow mode)
    this.camYawOffset = 0; // 0 = outside the rim, behind the child
    this.camBoatYawOffset = 0; // 0 = directly aft of the boat
    this.camDistance = 36;
    this.camHeight = 16;
    this._snapCameraOnce = false;
    this._orbitDragging = false;
    this._lastPointerX = 0;
    this.keys = { left: false, right: false };
    this.raycaster = new THREE.Raycaster();
    this._pointerNdc = new THREE.Vector2();
    this._cursorClient = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.55 };
    // Water-surface plane (y = 0.35) for stick aim from cursor
    this._aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.35);
    this._cursorAimPoint = new THREE.Vector3(0, 0.35, 0);
    this._hasCursorAim = false;
    
    // Customization selections
    this.customization = {
      playerName: '',
      characterType: 'boy',
      boatType: 'standard',
      boatColor: '#c4a574',
      flagColor: '#baffc9',
      flagSymbol: 'star',
      stickType: 'wooden',
      stickColor: '#d7a15c'
    };

    // State collections
    this.playerState = {}; // { socketId: { angle, prevAngle, isPlaying } }
    this.boatsData = {}; // Raw state from server
    this.boatMeshes = {};
    this.avatarMeshes = {};
    this.avatarControllers = {}; // Animation helpers keyed by socket id
    this.pushstickMeshes = {};
    this.obstacleMeshes = {};
    this.wind = { angle: 0, speed: 5 };
    
    // Animation flags
    this.pokeAnimations = {}; // { socketId: timeElapsed }
    this._lastFrameTime = performance.now();

    // Init ThreeJS
    this.initThree();
    this.initNetwork();
    this.bindUI();
    this._menuPreviews = startMenuPreviews();

    // Start loop
    this.animate();
  }

  initThree() {
    const container = document.getElementById('canvas-container');
    
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf6f3eb); // warm cardstock base background
    // Soft distant haze only — exponential fog was making the flat basin read as a dome
    this.scene.fog = new THREE.Fog(0xf6f3eb, 120, 320);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Name tags over avatars
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.inset = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.labelRenderer.domElement.style.zIndex = '2';
    container.appendChild(this.labelRenderer.domElement);

    // Camera (Isometric perspective setup)
    this.camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 1, 1000);
    this.updateCameraPosition();

    // Lighting
    setupLighting(this.scene);

    // Flat fountain water: short upright cylinder (top face = surface).
    // Do NOT rotateX — that tipped the cylinder on its side and looked like a dome.
    this.waterMat = createWaterMaterial();
    // Recessed pool: water sits inside the stone rim, slightly below the lip
    const waterRadius = FOUNTAIN_RADIUS - 2.2;
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(waterRadius, waterRadius, 0.1, 64),
      this.waterMat,
    );
    water.receiveShadow = true;
    water.position.y = 0.02;
    this.scene.add(water);

    // Darker basin floor for depth under translucent water
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(waterRadius + 0.3, waterRadius + 0.3, 0.06, 48),
      new THREE.MeshStandardMaterial({ color: 0x4f87a0, roughness: 0.95, metalness: 0 }),
    );
    basin.receiveShadow = true;
    basin.position.y = -0.08;
    this.scene.add(basin);

    // Large centerpiece fountain with sprouting water jets
    this.centerFountain = createCenterFountain();
    this.scene.add(this.centerFountain);

    // Ground, park trees, rims
    const scenery = createParkScenery(FOUNTAIN_RADIUS);
    this.scene.add(scenery);

    // Handle Resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  createNameLabel(name, isLocal = false) {
    const el = document.createElement('div');
    el.className = isLocal ? 'player-name-tag is-local' : 'player-name-tag';
    el.textContent = name || 'Sailor';
    const label = new CSS2DObject(el);
    label.position.set(0, 6.2, 0);
    return label;
  }

  updateScoreHUD(score = 0, streak = 0) {
    const scoreEl = document.getElementById('player-score');
    const streakEl = document.getElementById('ring-streak');
    if (scoreEl) scoreEl.textContent = String(score ?? 0);
    if (streakEl) {
      const n = streak || 0;
      streakEl.textContent = n > 0 ? `Ring streak ${n}/3` : '';
    }
  }

  updateCameraPosition() {
    const avatar = this.localId ? this.avatarMeshes[this.localId] : null;
    const boat = this.localId ? this.boatMeshes[this.localId] : null;

    if (this.activeCameraMode === 'follow') {
      // Orbit pivot = player on the rim; lookAt stays on the child
      const px = avatar ? avatar.position.x : Math.cos(this.playerAngle) * INNER_PATH_RADIUS;
      const pz = avatar ? avatar.position.z : Math.sin(this.playerAngle) * INNER_PATH_RADIUS;
      const lookY = 2.4;
      const camAngle = this.playerAngle + this.camYawOffset;

      const targetCamX = px + Math.cos(camAngle) * this.camDistance;
      const targetCamZ = pz + Math.sin(camAngle) * this.camDistance;
      const targetCamY = this.camHeight;

      const snap = this._snapCameraOnce;
      const lerp = snap ? 1 : 0.18;
      this.camera.position.x += (targetCamX - this.camera.position.x) * lerp;
      this.camera.position.y += (targetCamY - this.camera.position.y) * lerp;
      this.camera.position.z += (targetCamZ - this.camera.position.z) * lerp;
      if (snap) this._snapCameraOnce = false;

      this.camera.lookAt(px, lookY, pz);
    } else if (this.activeCameraMode === 'followBoat') {
      // Chase cam from directly behind the boat, looking forward along its heading
      const data = this.localId ? this.boatsData[this.localId] : null;
      const bx = boat ? boat.position.x : Math.cos(this.playerAngle) * (FOUNTAIN_RADIUS - 8);
      const bz = boat ? boat.position.z : Math.sin(this.playerAngle) * (FOUNTAIN_RADIUS - 8);

      // Prefer velocity as bow direction; else server/mesh yaw (game forward = cos/sin on XZ)
      let fx;
      let fz;
      const spd = data ? Math.hypot(data.vx, data.vy) : 0;
      if (spd > 0.08) {
        fx = data.vx / spd;
        fz = data.vy / spd;
      } else {
        const heading = data?.angle ?? boat?.rotation.y ?? (this.playerAngle + Math.PI);
        fx = Math.cos(heading);
        fz = Math.sin(heading);
      }

      // Orbit around the aft axis; 0 offset = straight behind the stern
      const aftAngle = Math.atan2(fz, fx) + Math.PI + this.camBoatYawOffset;
      const dist = Math.max(12, this.camDistance * 0.65);
      const height = Math.max(6, this.camHeight * 0.7);

      const targetCamX = bx + Math.cos(aftAngle) * dist;
      const targetCamZ = bz + Math.sin(aftAngle) * dist;

      const snap = this._snapCameraOnce;
      const lerp = snap ? 1 : 0.16;
      this.camera.position.x += (targetCamX - this.camera.position.x) * lerp;
      this.camera.position.y += (height - this.camera.position.y) * lerp;
      this.camera.position.z += (targetCamZ - this.camera.position.z) * lerp;
      if (snap) this._snapCameraOnce = false;
      // Look past the bow so the view reads as riding behind the boat
      this.camera.lookAt(bx + fx * 6, 1.1, bz + fz * 6);
    } else {
      // Bird's-eye overview of the whole fountain
      this.camera.position.x += (0 - this.camera.position.x) * 0.06;
      this.camera.position.y += (140 - this.camera.position.y) * 0.06;
      this.camera.position.z += (90 - this.camera.position.z) * 0.06;
      this.camera.lookAt(0, 0, 0);
    }
  }

  setCameraMode(mode) {
    if (!this._cameraModes.includes(mode)) return;
    this.activeCameraMode = mode;
    if (mode === 'follow') {
      // Default: behind the child, outside the rim, looking at them
      this.camYawOffset = 0;
      this._snapCameraOnce = true;
    } else if (mode === 'followBoat') {
      this.camBoatYawOffset = 0; // snap to true aft on enter
      this._snapCameraOnce = true;
    }
    this.syncCameraButtons();
  }

  cycleCameraMode() {
    const idx = this._cameraModes.indexOf(this.activeCameraMode);
    const next = this._cameraModes[(idx + 1) % this._cameraModes.length];
    this.setCameraMode(next);
  }

  syncCameraButtons() {
    document.querySelectorAll('.view-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.camera === this.activeCameraMode);
    });
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

      // Spawn new obstacles (lighthouse uses async GLB load)
      Promise.all(
        data.obstacles.map(async (obs) => {
          const mesh = await createObstacleMesh(obs.type, obs.radius, { facing: obs.facing });
          mesh.position.set(obs.x, mesh.position.y, obs.y);
          this.scene.add(mesh);
          this.obstacleMeshes[obs.id] = mesh;
        }),
      ).catch((err) => console.error('Failed to spawn obstacles:', err));
    });

    // Another player joined (also fires for self after Set Sail)
    this.socket.on('playerJoined', (data) => {
      // Keep local rim walk angle in sync with the boat the server just placed
      if (data.id === this.localId) {
        this.playerAngle = data.playerAngle;
      }
      this.playerState[data.id] = {
        angle: data.playerAngle,
        prevAngle: data.playerAngle,
        isPlaying: true,
        customization: data.boat.customization
      };
      this.spawnPlayerVisuals(data.id, data.playerAngle, data.boat).catch((err) => {
        console.error('Failed to spawn player visuals:', err);
      });
    });

    // Update coordinates and physics from server broadcast
    this.socket.on('stateUpdate', (data) => {
      this.wind = data.wind;
      this.updateWindVaneHUD();

      // Sync rim avatars (bots + remote humans)
      if (data.avatars) {
        data.avatars.forEach(({ id, angle }) => {
          if (id === this.localId) return;
          if (this.playerState[id]) {
            this.playerState[id].prevAngle = this.playerState[id].angle;
            this.playerState[id].angle = angle;
          }
        });
      }

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

          this.updateScoreHUD(boatUpdate.score, boatUpdate.ringStreak);

          // Handle Game Over / Sinking Screen
          if (boatUpdate.isSunk) {
            document.getElementById('sink-screen').classList.add('active');
          } else {
            document.getElementById('sink-screen').classList.remove('active');
          }
        }
      });
    });

    this.socket.on('ringCleared', (data) => {
      this.updateScoreHUD(data.score, data.ringStreak);
      const toast = document.getElementById('score-toast');
      if (!toast) return;
      toast.textContent = data.bonus
        ? `+${data.points}  ·  Streak +${data.bonus}!`
        : `+${data.points}`;
      toast.classList.add('visible');
      clearTimeout(this._scoreToastTimer);
      this._scoreToastTimer = setTimeout(() => toast.classList.remove('visible'), 1400);
    });

    // Another player moved their child avatar
    this.socket.on('playerMoved', (data) => {
      if (this.playerState[data.id]) {
        this.playerState[data.id].prevAngle = this.playerState[data.id].angle;
        this.playerState[data.id].angle = data.angle;
      }
    });

    // Boat poked trigger (start poke animation)
    this.socket.on('boatPoked', (data) => {
      this.pokeAnimations[data.id] = 0;
      this.avatarControllers[data.id]?.setPoking();
    });

    // Boat respawned / repaired
    this.socket.on('boatRespawned', (data) => {
      if (this.boatMeshes[data.id]) {
        this.boatsData[data.id] = data.boat;
        this.boatMeshes[data.id].position.set(data.boat.x, 0, data.boat.y);
        this.boatMeshes[data.id].rotation.y = data.boat.angle;
        this.boatMeshes[data.id].scale.set(1, 1, 1);
      }
    });

    // Player disconnected
    this.socket.on('playerLeft', (data) => {
      this.cleanPlayerVisuals(data.id);
      delete this.playerState[data.id];
      delete this.boatsData[data.id];
    });
  }

  async spawnPlayerVisuals(id, angle, boatData) {
    this.cleanPlayerVisuals(id);

    const isLocal = (id === this.localId);
    const custom = boatData.customization;

    // 1. Spawn wood boat mesh (GLB)
    const boatMesh = await createWoodBoat(
      custom.boatType,
      custom.boatColor,
      custom.flagColor,
      custom.flagSymbol,
    );
    boatMesh.position.set(boatData.x, 0, boatData.y);
    boatMesh.rotation.y = boatData.angle;
    this.scene.add(boatMesh);
    this.boatMeshes[id] = boatMesh;

    // 2. Spawn animated child avatar (Meshy boy/girl, or Henry fallback)
    const characterType = custom.characterType || 'boy';
    const avatarColor = isLocal ? 0xffdfd0 : 0xe6caa4;
    const controller = await createAnimatedChildAvatar(characterType, avatarColor);
    if (!this.boatMeshes[id]) {
      controller.dispose();
      return;
    }

    const avatar = controller.group;
    const px = Math.cos(angle) * INNER_PATH_RADIUS;
    const pz = Math.sin(angle) * INNER_PATH_RADIUS;
    avatar.position.set(px, 0, pz);
    avatar.lookAt(0, 0, 0);
    this.scene.add(avatar);
    this.avatarMeshes[id] = avatar;
    this.avatarControllers[id] = controller;

    const displayName = custom.playerName || 'Sailor';
    avatar.add(this.createNameLabel(displayName, isLocal));

    // Snap follow camera onto the new local child
    if (isLocal) {
      this.camera.position.set(
        px + Math.cos(this.playerAngle + this.camYawOffset) * this.camDistance,
        this.camHeight,
        pz + Math.sin(this.playerAngle + this.camYawOffset) * this.camDistance,
      );
      this.camera.lookAt(px, 2.4, pz);
    }

    // 3. Spawn Pushstick
    const pushstick = createPushstick(custom.stickType, custom.stickColor);
    pushstick.position.copy(avatar.position);
    pushstick.position.y = 1.15;
    pushstick.lookAt(boatMesh.position);
    this.scene.add(pushstick);
    this.pushstickMeshes[id] = pushstick;
  }

  cleanPlayerVisuals(id) {
    if (this.boatMeshes[id]) {
      this.scene.remove(this.boatMeshes[id]);
      delete this.boatMeshes[id];
    }
    if (this.avatarControllers[id]) {
      this.avatarControllers[id].dispose();
      delete this.avatarControllers[id];
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
    // 1. Character Selection
    document.querySelectorAll('#character-options .option-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        document.querySelectorAll('#character-options .option-card').forEach((c) => c.classList.remove('active'));
        const el = e.currentTarget;
        el.classList.add('active');
        this.customization.characterType = el.dataset.character;
      });
    });

    // 2. Boat Selection Clickers
    document.querySelectorAll('#boat-options .option-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        document.querySelectorAll('#boat-options .option-card').forEach((c) => c.classList.remove('active'));
        const el = e.currentTarget;
        el.classList.add('active');
        this.customization.boatType = el.dataset.boat;
      });
    });

    // 3. Pushstick Selection Clickers
    document.querySelectorAll('#stick-options .option-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        document.querySelectorAll('#stick-options .option-card').forEach((c) => c.classList.remove('active'));
        const el = e.currentTarget;
        el.classList.add('active');
        this.customization.stickType = el.dataset.stick;
      });
    });

    // 4. Color pickers
    const boatColorEl = document.getElementById('boat-color');
    const flagColorEl = document.getElementById('flag-color');
    boatColorEl.addEventListener('input', (e) => {
      this.customization.boatColor = e.target.value;
    });
    flagColorEl.addEventListener('input', (e) => {
      this.customization.flagColor = e.target.value;
    });

    // 5. Flag symbols
    document.querySelectorAll('#symbol-options .symbol-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#symbol-options .symbol-btn').forEach((b) => b.classList.remove('active'));
        const el = e.currentTarget;
        el.classList.add('active');
        this.customization.flagSymbol = el.dataset.symbol;
      });
    });

    // Name field
    const nameInput = document.getElementById('player-name');
    if (nameInput) {
      const saved = localStorage.getItem('toyboattoyboat-player-name');
      if (saved) {
        nameInput.value = saved;
        this.customization.playerName = saved;
      }
      nameInput.addEventListener('input', () => {
        this.customization.playerName = nameInput.value.trim().slice(0, 16);
      });
    }

    // 6. Play Button Click
    document.getElementById('btn-play').addEventListener('click', () => {
      const nameEl = document.getElementById('player-name');
      const name = (nameEl?.value || '').trim().slice(0, 16) || 'Sailor';
      this.customization.playerName = name;
      try {
        localStorage.setItem('toyboattoyboat-player-name', name);
      } catch {
        /* ignore */
      }

      document.getElementById('start-screen').classList.remove('active');
      document.getElementById('hud').classList.add('active');

      this._menuPreviews?.stop();
      this._menuPreviews = null;

      this.music.start();
      this.socket.emit('joinGame', {
        ...this.customization,
        playerAngle: this.playerAngle,
      });
    });

    // 7. Camera view options (also V to cycle). Orbit with right-drag; scroll to zoom.
    document.querySelectorAll('.view-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setCameraMode(btn.dataset.camera);
      });
    });
    this.syncCameraButtons();

    // 8. Respawn Button Click
    document.getElementById('btn-respawn').addEventListener('click', () => {
      this.socket.emit('respawnBoat');
      document.getElementById('sink-screen').classList.remove('active');
    });

    // Escape menu: mute + volume
    this.bindEscapeMenu();

    // 9. Keys: A = left around rim, D = right, Space = stick push, V = camera, Esc = menu
    window.addEventListener('keydown', (e) => {
      if (document.getElementById('start-screen').classList.contains('active')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (!e.repeat) this.setMenuOpen(!this.menuOpen);
        return;
      }

      if (this.menuOpen) return;
      if (e.target.matches('input, textarea, select')) return;

      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        this.keys.left = true;
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        this.keys.right = true;
      } else if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) this.emitPokeBoat();
      } else if (e.key === 'v' || e.key === 'V') {
        this.cycleCameraMode();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') this.keys.left = false;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') this.keys.right = false;
    });

    // 10. Pointer: click = stick push; right-drag / Alt-drag orbits; scroll zooms
    window.addEventListener('pointerdown', (e) => {
      if (document.getElementById('start-screen').classList.contains('active')) return;
      if (this.menuOpen) return;
      if (e.target.closest('#hud') || e.target.closest('#sink-screen') || e.target.closest('#start-screen') || e.target.closest('#escape-menu')) return;

      if (e.button === 2 || e.altKey) {
        this._orbitDragging = true;
        this._lastPointerX = e.clientX;
        e.preventDefault();
        return;
      }

      if (e.button === 0) {
        // Left click = aimed stick push (raycast onto own boat when possible)
        this.emitPokeBoat(e.clientX, e.clientY);
      }
    });

    window.addEventListener('pointermove', (e) => {
      this._cursorClient.x = e.clientX;
      this._cursorClient.y = e.clientY;
      this.updateCursorAim();

      if (this._orbitDragging && this.activeCameraMode === 'follow') {
        const dx = e.clientX - this._lastPointerX;
        this._lastPointerX = e.clientX;
        this.camYawOffset += dx * 0.005;
      } else if (this._orbitDragging && this.activeCameraMode === 'followBoat') {
        const dx = e.clientX - this._lastPointerX;
        this._lastPointerX = e.clientX;
        this.camBoatYawOffset += dx * 0.005;
      }
    });

    window.addEventListener('pointerup', () => {
      this._orbitDragging = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (document.getElementById('start-screen').classList.contains('active')) return;
      if (e.target.closest('#hud')) return;
      e.preventDefault();
    });

    window.addEventListener('wheel', (e) => {
      if (document.getElementById('start-screen').classList.contains('active')) return;
      if (this.activeCameraMode === 'overview') return;
      if (e.target.closest('#hud') || e.target.closest('#sink-screen')) return;
      this.camDistance = Math.min(90, Math.max(16, this.camDistance + e.deltaY * 0.04));
      this.camHeight = Math.max(10, this.camDistance * 0.42);
    }, { passive: true });
  }

  onPlayerMove() {
    // Keep angle normalized
    while (this.playerAngle < 0) this.playerAngle += Math.PI * 2;
    while (this.playerAngle > Math.PI * 2) this.playerAngle -= Math.PI * 2;

    if (this.localId && this.playerState[this.localId]) {
      this.playerState[this.localId].prevAngle = this.playerState[this.localId].angle;
      this.playerState[this.localId].angle = this.playerAngle;
    }

    this.socket.emit('movePlayer', { angle: this.playerAngle });
  }

  bindEscapeMenu() {
    const muteEl = document.getElementById('music-mute');
    const volumeEl = document.getElementById('music-volume');
    const volumeLabel = document.getElementById('music-volume-label');
    const volumeRow = volumeEl?.closest('.escape-volume-row');

    const syncUi = () => {
      muteEl.checked = this.music.muted;
      volumeEl.value = String(Math.round(this.music.volume * 100));
      volumeLabel.textContent = `${Math.round(this.music.volume * 100)}%`;
      volumeRow?.classList.toggle('is-muted', this.music.muted);
      volumeEl.disabled = this.music.muted;
    };

    syncUi();

    muteEl.addEventListener('change', () => {
      this.music.setMuted(muteEl.checked);
      syncUi();
    });

    volumeEl.addEventListener('input', () => {
      const pct = Number(volumeEl.value) / 100;
      this.music.setVolume(pct);
      if (this.music.muted && pct > 0) this.music.setMuted(false);
      syncUi();
    });

    document.getElementById('btn-resume').addEventListener('click', () => {
      this.setMenuOpen(false);
    });
  }

  setMenuOpen(open) {
    this.menuOpen = Boolean(open);
    document.getElementById('escape-menu').classList.toggle('active', this.menuOpen);
    if (this.menuOpen) {
      this.keys.left = false;
      this.keys.right = false;
      this._orbitDragging = false;
    }
  }

  /** Project cursor onto the water plane for stick aim. */
  updateCursorAim() {
    if (document.getElementById('start-screen').classList.contains('active')) {
      this._hasCursorAim = false;
      return;
    }

    this._pointerNdc.x = (this._cursorClient.x / window.innerWidth) * 2 - 1;
    this._pointerNdc.y = -(this._cursorClient.y / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this._pointerNdc, this.camera);

    const hit = this.raycaster.ray.intersectPlane(this._aimPlane, this._cursorAimPoint);
    this._hasCursorAim = Boolean(hit);
  }

  /**
   * Poke only when the stick tip / cursor ray hits the local boat mesh.
   * Misses (water, scenery) do nothing.
   */
  emitPokeBoat(clientX = null, clientY = null) {
    const x = clientX ?? this._cursorClient.x;
    const y = clientY ?? this._cursorClient.y;
    this._cursorClient.x = x;
    this._cursorClient.y = y;
    this.updateCursorAim();

    const boatMesh = this.localId ? this.boatMeshes[this.localId] : null;
    if (!boatMesh) return;

    this._pointerNdc.x = (x / window.innerWidth) * 2 - 1;
    this._pointerNdc.y = -(y / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this._pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(boatMesh, true);
    if (!hits.length) return;

    this.socket.emit('pokeBoat', {
      hitX: hits[0].point.x,
      hitY: hits[0].point.z,
    });
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

    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastFrameTime) / 1000);
    this._lastFrameTime = now;
    const time = clock.getElapsedTime();

    // Held A/D: walk left/right around the fountain rim
    if (!this.menuOpen && !document.getElementById('start-screen').classList.contains('active')) {
      if (this.keys.left || this.keys.right) {
        // Facing the fountain: A = left (clockwise), D = right (counter-clockwise)
        const dir = (this.keys.left ? 1 : 0) + (this.keys.right ? -1 : 0);
        if (dir !== 0) {
          this.playerAngle += dir * WALK_SPEED * (dt * 60);
          this.onPlayerMove();
        }
      }
    }

    // Center fountain water jets
    if (this.centerFountain) {
      updateCenterFountain(this.centerFountain, time);
    }

    // 1. Soft water glint
    if (this.waterMat) {
      this.waterMat.roughness = 0.22 + Math.sin(time) * 0.04;
    }

    // 2. Interpolate boat positions and animate them floating/bobbing
    for (const id in this.boatsData) {
      const data = this.boatsData[id];
      const mesh = this.boatMeshes[id];
      
      if (mesh) {
        if (data.isSunk) {
          mesh.position.y += (-1.5 - mesh.position.y) * 0.05;
          mesh.scale.x += (0.01 - mesh.scale.x) * 0.05;
          mesh.scale.y += (0.01 - mesh.scale.y) * 0.05;
          mesh.scale.z += (0.01 - mesh.scale.z) * 0.05;
        } else {
          const bobHeight = Math.sin(time * 2.5 + id.charCodeAt(0)) * 0.06;
          const tiltX = Math.cos(time * 1.5 + id.charCodeAt(0)) * 0.03;
          const tiltZ = Math.sin(time * 1.2 + id.charCodeAt(0)) * 0.03;

          // Follow server closely so local lerp doesn't slide hulls into solids
          mesh.position.x += (data.x - mesh.position.x) * 0.4;
          mesh.position.y += (bobHeight - mesh.position.y) * 0.15;
          mesh.position.z += (data.y - mesh.position.z) * 0.4;

          let angleDiff = data.angle - mesh.rotation.y;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          mesh.rotation.y += angleDiff * 0.35;

          mesh.rotation.x = tiltX;
          mesh.rotation.z = tiltZ;
        }
      }
    }

    // Keep local player angle mirrored into playerState for animation
    if (this.localId) {
      if (!this.playerState[this.localId]) {
        this.playerState[this.localId] = {
          angle: this.playerAngle,
          prevAngle: this.playerAngle,
          isPlaying: true,
        };
      } else {
        this.playerState[this.localId].angle = this.playerAngle;
      }
    }

    // Refresh stick aim so camera orbit keeps the tip under the cursor
    if (!this.menuOpen) this.updateCursorAim();

    // 3. Interpolate child avatars + walk/idle clips
    for (const id in this.playerState) {
      const state = this.playerState[id];
      const avatar = this.avatarMeshes[id];
      const boat = this.boatMeshes[id];
      const stick = this.pushstickMeshes[id];
      const controller = this.avatarControllers[id];

      if (avatar) {
        const targetX = Math.cos(state.angle) * INNER_PATH_RADIUS;
        const targetZ = Math.sin(state.angle) * INNER_PATH_RADIUS;

        const prevX = avatar.position.x;
        const prevZ = avatar.position.z;
        avatar.position.x += (targetX - avatar.position.x) * 0.22;
        avatar.position.z += (targetZ - avatar.position.z) * 0.22;
        avatar.position.y = 0;

        const moveDx = avatar.position.x - prevX;
        const moveDz = avatar.position.z - prevZ;
        const moveSpeed = Math.hypot(moveDx, moveDz);
        // Local: drive walk from held A/D (slow rim speed can sit under the lerp threshold)
        const isMoving = id === this.localId
          ? (this.keys.left || this.keys.right)
          : moveSpeed > 0.006;

        controller?.setMoving(isMoving);
        controller?.update(dt, now);

        if (isMoving) {
          // Face along the path tangent while walking
          const lookX = avatar.position.x + moveDx * 20;
          const lookZ = avatar.position.z + moveDz * 20;
          avatar.lookAt(lookX, 0, lookZ);
        } else if (boat) {
          avatar.lookAt(boat.position.x, 0, boat.position.z);
        } else {
          avatar.lookAt(0, 0, 0);
        }

        // 4. Pushstick: grip in the right hand; local player aims at cursor on the water
        if (stick) {
          const grip = controller?.getStickGripWorld?.(new THREE.Vector3())
            ?? avatar.localToWorld(new THREE.Vector3(0.45, 1.05, 0.15));

          let tipTarget;
          if (id === this.localId && this._hasCursorAim) {
            tipTarget = this._cursorAimPoint;
          } else if (boat) {
            tipTarget = new THREE.Vector3(boat.position.x, 0.35, boat.position.z);
          } else {
            tipTarget = avatar.localToWorld(new THREE.Vector3(0.2, 0.6, 2.5));
          }

          const fullLen = 12; // createPushstick tip at local -Z = -6
          const restScale = 0.55;
          const reach = Math.max(0.01, grip.distanceTo(tipTarget));
          const reachScale = Math.max(restScale, reach / fullLen);

          let scaleZ = restScale;
          if (this.pokeAnimations[id] !== undefined) {
            const animProgress = this.pokeAnimations[id];
            this.pokeAnimations[id] += 0.08;
            const t = Math.sin(Math.min(animProgress, 1) * Math.PI);
            scaleZ = restScale + t * (reachScale - restScale);
            if (animProgress >= 1.0) delete this.pokeAnimations[id];
          }

          const toward = tipTarget.clone().sub(grip).normalize();
          stick.scale.set(1, 1, scaleZ);
          stick.position.copy(grip).addScaledVector(toward, fullLen * scaleZ * 0.5);
          stick.lookAt(tipTarget);
        }
      }
    }

    // 5. Camera
    this.updateCameraPosition();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}

// Global clock for helper animations
const clock = new THREE.Clock();
