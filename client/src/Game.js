import * as THREE from 'three';
import { io } from 'socket.io-client';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { setupLighting } from './StyleSystem.js';
import { createPushstick, createObstacleMesh, createWindSock } from './Assets.js';
import { createAnimatedChildAvatar } from './ChildAvatar.js';
import { createWoodBoat } from './BoatModels.js';
import { updateCenterFountain } from './FountainCenter.js';
import { BackgroundMusic } from './BackgroundMusic.js';
import { AmbientBeds } from './AmbientBeds.js';
import { Sfx } from './Sfx.js';
import { startMenuPreviews } from './MenuPreviews.js';
import { DevMode } from './DevMode.js';
import { SoloSocket } from './SoloSocket.js';
import { bindMobileControls, releaseMobileKeys } from './MobileControls.js';
import { applyTouchUiClass, detectTouchUi } from './mobileDetect.js';
import { buildMapWorld, disposeObject3D, updateMapAmbience } from './maps/MapScenery.js';
import { DEFAULT_MAP_ID, getMap, listMaps, normalizeMapId } from '../../shared/maps.js';

const WALK_SPEED = 0.006; // rad per frame-unit when holding A/D
const MAP_STORAGE_KEY = 'tbtb-map';
const DEFAULT_FOLLOW_PITCH = (20 * Math.PI) / 180; // 20° above horizontal
/** Stick extend duration — keep in sync with ChildAvatar POKE_MS */
const POKE_ANIM_SEC = 0.42;
/** px — finger must move this far before a touch becomes camera orbit (not poke) */
const TOUCH_ORBIT_SLOP = 12;

export class Game {
  constructor() {
    this.isTouchUi = detectTouchUi();
    applyTouchUiClass(this.isTouchUi);

    this.socket = null;
    this.localId = null;
    this.playerAngle = Math.random() * Math.PI * 2;
    this.activeCameraMode = 'follow'; // 'follow' | 'followBoat' | 'overview'
    this._cameraModes = ['follow', 'followBoat', 'overview'];
    this.playMode = 'solo'; // 'solo' | 'multiplayer'
    this.menuOpen = false;
    this.devMode = null;
    this.selectedMapId = this.loadSavedMapId();
    this.map = getMap(this.selectedMapId);
    this.mapWorld = null;
    this.centerFountain = null;
    this.waterMat = null;
    this.music = new BackgroundMusic();
    this.ambients = new AmbientBeds();
    this.sfx = new Sfx();
    this.sfx.setVolume(this.ambients.volume);
    this._boatLook = new THREE.Vector3();

    // Orbit / zoom around the local player (follow mode)
    this.camYawOffset = 0; // 0 = outside the rim, behind the child
    this.camBoatYawOffset = 0; // 0 = directly aft of the boat
    this.camPitch = DEFAULT_FOLLOW_PITCH;
    this.camDistance = 36;
    this.camHeight = 16;
    this._snapCameraOnce = false;
    this._orbitDragging = false;
    this._lastPointerX = 0;
    this._lastPointerY = 0;
    this._lastMiddleClickAt = 0;
    this._touchPtr = null; // { id, x, y, moved, orbiting } — poke vs orbit on touch
    this._pinch = null; // { dist0, cam0 } — two-finger zoom on touch
    this._defaultCam = {
      yawOffset: 0,
      boatYawOffset: 0,
      pitch: DEFAULT_FOLLOW_PITCH,
      distance: 36,
      height: 16,
    };
    this.keys = { left: false, right: false };
    this._steerDir = 0;
    this._steerLean = 0; // visual bank while holding rudder (rad)
    this._steerYaw = 0; // slight nose yaw into the turn (rad)
    this.raycaster = new THREE.Raycaster();
    this._pointerNdc = new THREE.Vector2();
    this._cursorClient = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.55 };
    // Water-surface plane (y = 0.35) for stick aim from cursor
    this._aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.35);
    this._cursorAimPoint = new THREE.Vector3(0, 0.35, 0);
    this._duckWorldPos = new THREE.Vector3();
    this._hasCursorAim = false;
    
    // Customization selections
    this.customization = {
      playerName: '',
      characterType: 'boy',
      boatType: 'standard',
      boatColor: '#c4a574',
      flagColor: '#baffc9',
      flagSymbol: 'star',
      clothesColor: '#3d6fb8',
      clothesAccent: '#e8a04a',
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
    this.windSock = null; // { root, sleeve, island } — Paris island marker
    this.wind = { angle: 0, speed: 5, phase: 'breeze' };
    this.ambientBoats = [];
    this._lastWindPhase = 'breeze';
    this.courseCatalog = [];
    this.activeCourse = null; // { courseId, ringOrder, nextIndex, startedAtMs }
    this._courseNextRingId = null;
    this._splashRipples = [];
    this._scorePopups = []; // floating +points CSS2D labels

    // Animation flags
    this.pokeAnimations = {}; // { socketId: timeElapsed }
    this.lassoAnimations = {}; // { socketId: { t, duration } }
    this.lassoMeshes = {}; // rope Line meshes
    this._lastFrameTime = performance.now();

    // Init ThreeJS
    this.initThree();
    this.initNetwork();
    this.bindUI();
    this._menuPreviews = startMenuPreviews({ useStaticBoats: this.isTouchUi });
    bindMobileControls(this);

    // Start loop
    this.animate();
  }

  getPixelRatioCap() {
    return this.isTouchUi ? 1.25 : 2;
  }

  applyRendererSize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.getPixelRatioCap());
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applyCamZoom(delta) {
    this.camDistance = Math.min(90, Math.max(16, this.camDistance + delta));
    if (this.activeCameraMode === 'followBoat') {
      this.camHeight = Math.max(10, this.camDistance * 0.42);
    }
  }

  loadSavedMapId() {
    try {
      return normalizeMapId(localStorage.getItem(MAP_STORAGE_KEY));
    } catch {
      return DEFAULT_MAP_ID;
    }
  }

  persistMapId(mapId) {
    this.selectedMapId = normalizeMapId(mapId);
    try {
      localStorage.setItem(MAP_STORAGE_KEY, this.selectedMapId);
    } catch {
      /* ignore */
    }
  }

  pathPos(angle) {
    const rx = this.map?.path?.rx ?? 104.5;
    const rz = this.map?.path?.rz ?? 104.5;
    return {
      x: Math.cos(angle) * rx,
      z: Math.sin(angle) * rz,
    };
  }

  waterSpawnPos(angle, inset = 8) {
    const rx = (this.map?.water?.rx ?? 100) - inset;
    const rz = (this.map?.water?.rz ?? 100) - inset;
    return {
      x: Math.cos(angle) * rx,
      z: Math.sin(angle) * rz,
    };
  }

  rebuildWorld(mapPayload) {
    const map = mapPayload?.id ? { ...getMap(mapPayload.id), ...mapPayload } : getMap(this.selectedMapId);
    this.map = map;
    this.selectedMapId = map.id;

    if (this.mapWorld) {
      this.scene.remove(this.mapWorld);
      disposeObject3D(this.mapWorld);
      this.mapWorld = null;
      this.centerFountain = null;
      this.waterMat = null;
    }

    const built = buildMapWorld(map);
    this.mapWorld = built.root;
    this.waterMat = built.waterMat;
    this.centerFountain = built.centerFountain;
    this.scene.add(this.mapWorld);

    const fog = map.fog || { near: 120, far: 320, color: 0xf6f3eb };
    this.scene.background = new THREE.Color(fog.color);
    this.scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);

    this.syncMapTitleUI(map);

    this.music?.setForMap(map);
    this.syncMapSelectorUI();
  }

  /** Pause subtitle uses the official map name. */
  syncMapTitleUI(map = null) {
    const m = map || getMap(this.selectedMapId || this.map?.id || DEFAULT_MAP_ID);
    const subtitle = document.querySelector('.escape-menu-subtitle');
    if (subtitle) subtitle.textContent = m.name || 'Map';
  }

  initThree() {
    const container = document.getElementById('canvas-container');
    
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf6f3eb);
    this.scene.fog = new THREE.Fog(0xf6f3eb, 120, 320);

    // Renderer — mobile profile is gated; desktop keeps antialias + DPR 2 + soft shadows
    const antialias = !this.isTouchUi;
    this.renderer = new THREE.WebGLRenderer({ antialias, alpha: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Name tags over avatars
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.inset = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.labelRenderer.domElement.style.zIndex = '2';
    container.appendChild(this.labelRenderer.domElement);

    // Camera (Isometric perspective setup)
    this.camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 1, 1200);
    this.applyRendererSize();
    this.updateCameraPosition();

    // Lighting
    setupLighting(this.scene, {
      shadowMapSize: this.isTouchUi ? 1024 : 2048,
    });

    this.rebuildWorld(getMap(this.selectedMapId));

    // Handle Resize / orientation (refresh DPR for mobile)
    window.addEventListener('resize', () => this.applyRendererSize());
    window.visualViewport?.addEventListener('resize', () => this.applyRendererSize());
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
      // Orbit pivot = sailor; lookAt stays on sailor so pitch / tilt do not change
      const rim = this.pathPos(this.playerAngle);
      const px = avatar ? avatar.position.x : rim.x;
      const pz = avatar ? avatar.position.z : rim.z;
      const lookY = 2.4;

      // Walking: yaw-only auto-orbit so camera–sailor–boat align (boat on screen-center X)
      const walking =
        !this.menuOpen
        && !this._orbitDragging
        && (this.keys.left || this.keys.right);
      if (walking) {
        const data = this.localId ? this.boatsData[this.localId] : null;
        const spawn = this.waterSpawnPos(this.playerAngle, 8);
        const bx = boat ? boat.position.x : (data?.x ?? spawn.x);
        const bz = boat ? boat.position.z : (data?.y ?? spawn.z);
        const boatAngle = Math.atan2(bz - pz, bx - px);
        let desiredOffset = boatAngle + Math.PI - this.playerAngle;
        while (desiredOffset > Math.PI) desiredOffset -= Math.PI * 2;
        while (desiredOffset < -Math.PI) desiredOffset += Math.PI * 2;
        let diff = desiredOffset - this.camYawOffset;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.camYawOffset += diff * 0.14;
      }

      const camAngle = this.playerAngle + this.camYawOffset;
      const pitch = THREE.MathUtils.clamp(this.camPitch, 0.12, 1.25);
      this.camPitch = pitch;
      const horiz = Math.cos(pitch) * this.camDistance;

      const targetCamX = px + Math.cos(camAngle) * horiz;
      const targetCamZ = pz + Math.sin(camAngle) * horiz;
      const targetCamY = lookY + Math.sin(pitch) * this.camDistance;
      this.camHeight = targetCamY;

      const snap = this._snapCameraOnce;
      const lerp = snap ? 1 : 0.22;
      this.camera.position.x += (targetCamX - this.camera.position.x) * lerp;
      this.camera.position.y += (targetCamY - this.camera.position.y) * lerp;
      this.camera.position.z += (targetCamZ - this.camera.position.z) * lerp;
      if (snap) this._snapCameraOnce = false;

      this.camera.lookAt(px, lookY, pz);
    } else if (this.activeCameraMode === 'followBoat') {
      // Stern chase: sit directly aft of the visual hull, look toward the bow.
      // Boat models use local +X as bow; with rotation.y = θ that is (cos θ, -sin θ).
      const data = this.localId ? this.boatsData[this.localId] : null;
      const spawn = this.waterSpawnPos(this.playerAngle, 8);
      const bx = boat ? boat.position.x : (data?.x ?? spawn.x);
      const bz = boat ? boat.position.z : (data?.y ?? spawn.z);
      const by = boat ? boat.position.y : 0;
      // Prefer live mesh yaw so the camera tracks the hull you see when steering
      const heading = Number.isFinite(boat?.rotation.y)
        ? boat.rotation.y
        : (data?.angle ?? this.playerAngle + Math.PI);

      if (!this._orbitDragging) this.camBoatYawOffset = 0;

      // Visual bow is local −X on these hulls (local +X faces the stern)
      let bowX = -Math.cos(heading);
      let bowZ = Math.sin(heading);
      const yaw = this.camBoatYawOffset;
      if (yaw !== 0) {
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const rx = bowX * c - bowZ * s;
        const rz = bowX * s + bowZ * c;
        bowX = rx;
        bowZ = rz;
      }

      const dist = THREE.MathUtils.clamp(this.camDistance * 0.38, 10, 26);
      const height = 4.5 + THREE.MathUtils.clamp((this.camDistance - 36) * 0.05, -1.2, 2.5);

      // Directly behind the stern
      const targetCamX = bx - bowX * dist;
      const targetCamZ = bz - bowZ * dist;
      const targetCamY = by + height;

      // Hard-lock to the stern while steering; soften only during right-drag orbit
      if (this._snapCameraOnce || !this._orbitDragging) {
        this.camera.position.set(targetCamX, targetCamY, targetCamZ);
        this._snapCameraOnce = false;
      } else {
        this.camera.position.x += (targetCamX - this.camera.position.x) * 0.25;
        this.camera.position.y += (targetCamY - this.camera.position.y) * 0.25;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.25;
      }

      this._boatLook.set(bx + bowX * 8, by + 1.2, bz + bowZ * 8);
      this.camera.lookAt(this._boatLook);
    } else {
      // Bird's-eye overview of the whole basin
      const span = Math.max(this.map?.water?.rx ?? 100, this.map?.water?.rz ?? 100);
      const overviewY = 140 * (span / 100);
      const overviewZ = 90 * (span / 100);
      this.camera.position.x += (0 - this.camera.position.x) * 0.06;
      this.camera.position.y += (overviewY - this.camera.position.y) * 0.06;
      this.camera.position.z += (overviewZ - this.camera.position.z) * 0.06;
      this.camera.lookAt(0, 0, 0);
    }
  }

  setCameraMode(mode) {
    if (!this._cameraModes.includes(mode)) return;
    const prev = this.activeCameraMode;
    this.activeCameraMode = mode;
    if (mode === 'follow') {
      // Default: behind the child, outside the rim, looking at them
      if (prev !== 'follow') {
        this.camYawOffset = 0;
        this.camPitch = DEFAULT_FOLLOW_PITCH;
      }
      this._snapCameraOnce = true;
    } else if (mode === 'followBoat') {
      this.camBoatYawOffset = 0; // snap to true aft on enter
      this._snapCameraOnce = true;
      // Rim walk off — A/D only steer the boat
      this.sfx?.setMoving(false);
      if (this.localId) this.avatarControllers[this.localId]?.setMoving(false);
      this._steerDir = (this.keys.left ? 1 : 0) + (this.keys.right ? -1 : 0);
      this.socket?.emit('steerBoat', { dir: this._steerDir });
    }
    if (mode !== 'followBoat' && this._steerDir !== 0) {
      this._steerDir = 0;
      this.socket?.emit('steerBoat', { dir: 0 });
    }
    this.ambients?.setMode(mode);
    this.syncCameraButtons();
    this.updateWindVaneHUD();
  }

  cycleCameraMode() {
    const idx = this._cameraModes.indexOf(this.activeCameraMode);
    const next = this._cameraModes[(idx + 1) % this._cameraModes.length];
    this.setCameraMode(next);
  }

  /** Restore orbit/zoom to the default Follow Player / Follow Boat framing. */
  resetCameraView() {
    const d = this._defaultCam;
    this.camYawOffset = d.yawOffset;
    this.camBoatYawOffset = d.boatYawOffset;
    this.camPitch = d.pitch;
    this.camDistance = d.distance;
    this.camHeight = d.height;
    this._snapCameraOnce = true;
  }

  syncCameraButtons() {
    document.querySelectorAll('.view-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.camera === this.activeCameraMode);
    });
  }

  isLocalHost() {
    return ['localhost', '127.0.0.1'].includes(window.location.hostname);
  }

  getPlayMode() {
    return this.playMode === 'multiplayer' ? 'multiplayer' : 'solo';
  }

  usesOfflineSolo() {
    return this.getPlayMode() === 'solo' && !this.isLocalHost();
  }

  setPlayMode(mode) {
    this.playMode = mode === 'multiplayer' ? 'multiplayer' : 'solo';
    try {
      localStorage.setItem('toyboattoyboat-play-mode', this.playMode);
    } catch {
      /* ignore */
    }

    document.querySelectorAll('.play-mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.playMode === this.playMode);
    });
    const soloPanel = document.getElementById('solo-mode-panel');
    const mpPanel = document.getElementById('multiplayer-mode-panel');
    if (soloPanel) soloPanel.hidden = this.playMode !== 'solo';
    if (mpPanel) mpPanel.hidden = this.playMode !== 'multiplayer';
  }

  resolveServerUrl() {
    const isLocal = this.isLocalHost();

    if (this.usesOfflineSolo()) return null;

    // Local solo uses the shared simulation through the Socket.IO dev server.
    if (this.getPlayMode() === 'solo') {
      return 'http://localhost:3005';
    }

    try {
      const q = new URLSearchParams(window.location.search).get('server');
      if (q) return q.replace(/\/$/, '');
    } catch {
      /* ignore */
    }
    try {
      const saved = localStorage.getItem('toyboattoyboat-server-url');
      if (saved) return saved.replace(/\/$/, '');
    } catch {
      /* ignore */
    }
    if (import.meta.env.VITE_SERVER_URL) {
      return String(import.meta.env.VITE_SERVER_URL).replace(/\/$/, '');
    }
    return isLocal ? 'http://localhost:3005' : window.location.origin;
  }

  initNetwork() {
    // Static hosts cannot run Socket.IO. Offline solo connects when Set Sail is pressed.
    if (this.usesOfflineSolo()) return;
    const serverUrl = this.resolveServerUrl();
    this.connectSocket(serverUrl);
  }

  connectSoloSocket() {
    this._serverUrl = 'offline-solo';
    this.socket = new SoloSocket();
    this.localId = this.socket.id;
    if (this.devMode) this.devMode.bindSocket(this.socket);
    else this.devMode = new DevMode(this.socket);
    this.bindSocketHandlers();
  }

  connectSocket(serverUrl) {
    this._serverUrl = serverUrl;
    console.log('Game server:', serverUrl);
    this.socket = io(serverUrl, { transports: ['websocket', 'polling'] });
    if (this.devMode) this.devMode.bindSocket(this.socket);
    else this.devMode = new DevMode(this.socket);
    this.bindSocketHandlers();
  }

  bindSocketHandlers() {
    const s = this.socket;
    if (!s || s._toyboatBound) return;
    s._toyboatBound = true;

    s.on('connect', () => {
      this.localId = s.id;
      console.log('Connected to server, Socket ID:', this.localId);
    });

    s.on('initGame', (data) => {
      for (const id in this.obstacleMeshes) {
        this.scene.remove(this.obstacleMeshes[id]);
      }
      this.obstacleMeshes = {};
      this.ambientBoats = [];
      this.activeCourse = null;
      this._courseNextRingId = null;
      this.populateCourseSelect(data.courses || []);

      if (data.map) {
        const prevId = this.map?.id;
        this.rebuildWorld(data.map);
        this.persistMapId(data.map.id);
        // Map change mid-session: clear player visuals; playerJoined will re-spawn
        if (data.mapChanged && prevId && prevId !== data.map.id) {
          const ids = new Set([
            ...Object.keys(this.playerState),
            ...Object.keys(this.boatMeshes),
            ...Object.keys(this.avatarMeshes),
          ]);
          for (const id of ids) {
            this.cleanPlayerVisuals(id);
            delete this.playerState[id];
            delete this.boatsData[id];
          }
        }
      }

      this.clearWindSock();

      Promise.all(
        (data.obstacles || []).map(async (obs) => {
          if (obs.noMesh) return null;
          const mesh = await createObstacleMesh(obs.type, obs.radius, { facing: obs.facing });
          mesh.position.set(obs.x, mesh.position.y, obs.y);
          mesh.userData.obstacleId = obs.id;
          mesh.userData.obstacleType = obs.type;
          mesh.userData.baseScale = mesh.scale.x;
          this.scene.add(mesh);
          this.obstacleMeshes[obs.id] = mesh;
          return { obs, mesh };
        }),
      )
        .then((spawned) => {
          this.attachParisWindSock(spawned);
        })
        .catch((err) => console.error('Failed to spawn obstacles:', err));
    });

    s.on('playerJoined', (data) => {
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

    s.on('stateUpdate', (data) => {
      const prevPhase = this._lastWindPhase;
      this.wind = data.wind;
      const phase = data.wind?.phase || 'breeze';
      if (phase === 'gust' && prevPhase !== 'gust') {
        this.sfx?.playGust();
      }
      this._lastWindPhase = phase;
      if (data.ambient) this.ambientBoats = data.ambient;
      this.updateWindVaneHUD();

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
        this.boatsData[id] = boatUpdate;

        if (id === this.localId) {
          const dmgBar = document.getElementById('damage-bar');
          if (dmgBar) {
            dmgBar.style.width = `${boatUpdate.damage}%`;
            if (boatUpdate.damage > 50) {
              dmgBar.style.background = 'linear-gradient(90deg, #a8e6cf, #dcedc1)';
            } else if (boatUpdate.damage > 20) {
              dmgBar.style.background = 'linear-gradient(90deg, #ffd3b6, #ffaaa5)';
            } else {
              dmgBar.style.background = 'linear-gradient(90deg, #ff8b94, #ff6b6b)';
            }
          }

          this.updateScoreHUD(boatUpdate.score, boatUpdate.ringStreak);

          if (boatUpdate.isSunk) {
            document.getElementById('sink-screen').classList.add('active');
          } else {
            document.getElementById('sink-screen').classList.remove('active');
          }
        }
      });
    });

    s.on('ringCleared', (data) => {
      this.updateScoreHUD(data.score, data.ringStreak);
      this.sfx?.playRingScore();

      const gained = (data.points || 0) + (data.bonus || 0) + (data.sharedBonus || 0);
      let popupText = `+${gained}`;
      if (data.bonus) popupText = `+${gained}!`;
      const boat = this.localId ? this.boatsData[this.localId] : null;
      const ring = data.obstacleId ? this.obstacleMeshes[data.obstacleId] : null;
      const px = boat?.x ?? ring?.position.x ?? 0;
      const pz = boat?.y ?? ring?.position.z ?? 0;
      this.spawnScorePopup(px, pz, popupText);

      const toast = document.getElementById('score-toast');
      if (!toast) return;
      let text = `+${data.points}`;
      if (data.bonus) text += `  ·  Streak +${data.bonus}!`;
      if (data.sharedBonus) text += `  ·  Double +${data.sharedBonus}`;
      toast.textContent = text;
      toast.classList.add('visible');
      clearTimeout(this._scoreToastTimer);
      this._scoreToastTimer = setTimeout(() => toast.classList.remove('visible'), 1400);
    });

    s.on('sharedRing', (data) => {
      const toast = document.getElementById('score-toast');
      if (!toast) return;
      toast.textContent = `Double clear! +${data.bonus}`;
      toast.classList.add('visible');
      clearTimeout(this._scoreToastTimer);
      this._scoreToastTimer = setTimeout(() => toast.classList.remove('visible'), 1600);
    });

    s.on('boatSplashed', (data) => {
      this.sfx?.playSplash(data.strength || 1);
      this.spawnSplashRipple(data.x, data.y, data.strength || 1);
    });

    s.on('courseStarted', (data) => {
      this.activeCourse = {
        courseId: data.courseId,
        ringOrder: data.ringOrder,
        nextIndex: 0,
        startedAtMs: performance.now(),
        medalTimes: data.medalTimes,
      };
      this._courseNextRingId = data.nextRingId;
      this.setCourseUiActive(true);
      this.setCourseStatus(`${data.name} — ring 1/${data.ringOrder.length}`);
    });

    s.on('courseProgress', (data) => {
      if (!this.activeCourse) return;
      this.activeCourse.nextIndex = data.nextIndex;
      this._courseNextRingId = data.nextRingId;
      const total = data.ringOrder?.length || this.activeCourse.ringOrder.length;
      this.setCourseStatus(`Ring ${Math.min(data.nextIndex + 1, total)}/${total}`);
    });

    s.on('courseFinished', (data) => {
      this.activeCourse = null;
      this._courseNextRingId = null;
      this.setCourseUiActive(false);
      const medal = data.medal ? data.medal.toUpperCase() : 'FINISH';
      const secs = (data.timeMs / 1000).toFixed(1);
      const pb = this.recordCourseBest(data.courseId, data.timeMs);
      const pbNote = pb?.isNew ? ' · New PB!' : pb?.bestMs != null ? ` · PB ${(pb.bestMs / 1000).toFixed(1)}s` : '';
      this.setCourseStatus(`${data.name}: ${secs}s — ${medal}${pbNote}`);
      const toast = document.getElementById('score-toast');
      if (toast) {
        toast.textContent = `${data.name} ${secs}s · ${medal}`;
        toast.classList.add('visible');
        clearTimeout(this._scoreToastTimer);
        this._scoreToastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
      }
      this.populateCourseSelect(this.courseCatalog);
    });

    s.on('courseAbandoned', () => {
      this.activeCourse = null;
      this._courseNextRingId = null;
      this.setCourseUiActive(false);
      this.setCourseStatus('');
    });

    s.on('courseError', (data) => {
      this.setCourseStatus(data.message || 'Course unavailable');
    });

    s.on('playerMoved', (data) => {
      if (this.playerState[data.id]) {
        this.playerState[data.id].prevAngle = this.playerState[data.id].angle;
        this.playerState[data.id].angle = data.angle;
      }
    });

    s.on('boatPoked', (data) => {
      this.pokeAnimations[data.id] = 0;
      this.avatarControllers[data.id]?.setPoking();
      if (data.id === this.localId) this.sfx?.playPoke();
    });

    s.on('boatLassoed', (data) => {
      this.startLassoVisual(data.id);
      this.avatarControllers[data.id]?.setPoking();
    });

    s.on('boatRespawned', (data) => {
      if (this.boatMeshes[data.id]) {
        this.boatsData[data.id] = data.boat;
        this.boatMeshes[data.id].position.set(data.boat.x, 0, data.boat.y);
        this.boatMeshes[data.id].rotation.y = data.boat.angle;
        this.boatMeshes[data.id].scale.set(1, 1, 1);
      }
    });

    s.on('playerLeft', (data) => {
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
    const controller = await createAnimatedChildAvatar(characterType, {
      skinTint: avatarColor,
      clothesColor: custom.clothesColor || null,
      clothesAccent: custom.clothesAccent || null,
    });
    if (!this.boatMeshes[id]) {
      controller.dispose();
      return;
    }

    const avatar = controller.group;
    const rim = this.pathPos(angle);
    const px = rim.x;
    const pz = rim.z;
    avatar.position.set(px, 0, pz);
    avatar.lookAt(0, 0, 0);
    this.scene.add(avatar);
    this.avatarMeshes[id] = avatar;
    this.avatarControllers[id] = controller;

    const displayName = custom.playerName || 'Sailor';
    avatar.add(this.createNameLabel(displayName, isLocal));

    // Snap follow camera onto the new local child
    if (isLocal) {
      const pitch = THREE.MathUtils.clamp(this.camPitch ?? DEFAULT_FOLLOW_PITCH, 0.12, 1.25);
      const horiz = Math.cos(pitch) * this.camDistance;
      const yaw = this.playerAngle + this.camYawOffset;
      this.camera.position.set(
        px + Math.cos(yaw) * horiz,
        2.4 + Math.sin(pitch) * this.camDistance,
        pz + Math.sin(yaw) * horiz,
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
      // A CSS2DObject only drops its DOM node on its own `removed` event, which
      // does not fire when an ancestor is removed. Detach name tags explicitly
      // or they pile up in the label layer on every respawn / map restart.
      const labels = [];
      this.avatarMeshes[id].traverse((obj) => {
        if (obj.isCSS2DObject) labels.push(obj);
      });
      labels.forEach((label) => label.removeFromParent());
      this.scene.remove(this.avatarMeshes[id]);
      delete this.avatarMeshes[id];
    }
    if (this.pushstickMeshes[id]) {
      this.scene.remove(this.pushstickMeshes[id]);
      delete this.pushstickMeshes[id];
    }
    this.removeLassoVisual(id);
  }

  startLassoVisual(id) {
    this.removeLassoVisual(id);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xc4a574,
      linewidth: 2,
      transparent: true,
      opacity: 0.95,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    this.scene.add(line);
    this.lassoMeshes[id] = line;
    this.lassoAnimations[id] = { t: 0, duration: 1.05 };
  }

  removeLassoVisual(id) {
    if (this.lassoMeshes[id]) {
      this.scene.remove(this.lassoMeshes[id]);
      this.lassoMeshes[id].geometry?.dispose();
      this.lassoMeshes[id].material?.dispose();
      delete this.lassoMeshes[id];
    }
    delete this.lassoAnimations[id];
  }

  updateLassoVisuals(dt) {
    for (const id of Object.keys(this.lassoAnimations)) {
      const anim = this.lassoAnimations[id];
      const line = this.lassoMeshes[id];
      const avatar = this.avatarMeshes[id];
      const boat = this.boatMeshes[id];
      const controller = this.avatarControllers[id];
      anim.t += dt;

      if (!line || !avatar || !boat || boat.visible === false) {
        this.removeLassoVisual(id);
        continue;
      }

      const grip = controller?.getStickGripWorld?.(new THREE.Vector3())
        ?? avatar.localToWorld(new THREE.Vector3(0.45, 1.35, 0.15));
      const boatPos = new THREE.Vector3(boat.position.x, 0.55, boat.position.z);

      // Throw: rope tip races out to the boat, then stays taut while reeling
      const throwT = Math.min(1, anim.t / 0.22);
      const tip = grip.clone().lerp(boatPos, throwT);
      const pos = line.geometry.attributes.position.array;
      pos[0] = grip.x;
      pos[1] = grip.y;
      pos[2] = grip.z;
      pos[3] = tip.x;
      pos[4] = tip.y;
      pos[5] = tip.z;
      line.geometry.attributes.position.needsUpdate = true;

      if (anim.t > anim.duration) {
        this.removeLassoVisual(id);
      } else if (anim.t > anim.duration - 0.2 && line.material) {
        line.material.opacity = Math.max(0, (anim.duration - anim.t) / 0.2);
      }
    }
  }

  emitLassoBoat() {
    if (!this.localId || !this.boatMeshes[this.localId]) return;
    const data = this.boatsData[this.localId];
    if (data?.isSunk) return;
    this.socket.emit('lassoBoat');
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
    const clothesColorEl = document.getElementById('clothes-color');
    const clothesAccentEl = document.getElementById('clothes-accent');
    boatColorEl?.addEventListener('input', (e) => {
      this.customization.boatColor = e.target.value;
    });
    flagColorEl?.addEventListener('input', (e) => {
      this.customization.flagColor = e.target.value;
    });
    clothesColorEl?.addEventListener('input', (e) => {
      this.customization.clothesColor = e.target.value;
    });
    clothesAccentEl?.addEventListener('input', (e) => {
      this.customization.clothesAccent = e.target.value;
    });
    if (boatColorEl) this.customization.boatColor = boatColorEl.value;
    if (flagColorEl) this.customization.flagColor = flagColorEl.value;
    if (clothesColorEl) this.customization.clothesColor = clothesColorEl.value;
    if (clothesAccentEl) this.customization.clothesAccent = clothesAccentEl.value;

    // 5. Flag symbols
    document.querySelectorAll('#symbol-options .symbol-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#symbol-options .symbol-btn').forEach((b) => b.classList.remove('active'));
        const el = e.currentTarget;
        el.classList.add('active');
        this.customization.flagSymbol = el.dataset.symbol;
      });
    });

    // Play mode (solo / multiplayer)
    let initialMode = 'solo';
    try {
      const qServer = new URLSearchParams(window.location.search).get('server');
      const savedMode = localStorage.getItem('toyboattoyboat-play-mode');
      if (qServer) initialMode = 'multiplayer';
      else if (savedMode === 'solo' || savedMode === 'multiplayer') initialMode = savedMode;
    } catch {
      /* ignore */
    }
    this.setPlayMode(initialMode);
    document.querySelectorAll('.play-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.setPlayMode(btn.dataset.playMode));
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

    // Multiplayer server URL (Cloudflare Tunnel / hosted)
    const serverInput = document.getElementById('server-url');
    if (serverInput) {
      try {
        const q = new URLSearchParams(window.location.search).get('server');
        const saved = localStorage.getItem('toyboattoyboat-server-url');
        if (q) serverInput.value = q;
        else if (saved) serverInput.value = saved;
      } catch {
        /* ignore */
      }
    }

    // 6. Play Button Click
    document.getElementById('btn-play').addEventListener('click', async () => {
      const nameEl = document.getElementById('player-name');
      const name = (nameEl?.value || '').trim().slice(0, 16) || 'Sailor';
      this.customization.playerName = name;
      try {
        localStorage.setItem('toyboattoyboat-player-name', name);
      } catch {
        /* ignore */
      }

      const serverEl = document.getElementById('server-url');
      const typedServer = (serverEl?.value || '').trim().replace(/\/$/, '');
      if (this.getPlayMode() === 'multiplayer') {
        try {
          if (typedServer) localStorage.setItem('toyboattoyboat-server-url', typedServer);
          else localStorage.removeItem('toyboattoyboat-server-url');
        } catch {
          /* ignore */
        }
        if (!this.isLocalHost() && !typedServer && !import.meta.env.VITE_SERVER_URL) {
          const hasQuery = !!new URLSearchParams(window.location.search).get('server');
          if (!hasQuery) {
            alert('Multiplayer needs a server URL.\nPaste your Cloudflare Tunnel link (https://….trycloudflare.com), then try again.');
            return;
          }
        }
      }

      const offlineSolo = this.usesOfflineSolo();
      const targetUrl = offlineSolo ? 'offline-solo' : this.resolveServerUrl();
      if (!this.socket?.connected || this._serverUrl !== targetUrl) {
        this.socket?.removeAllListeners();
        this.socket?.disconnect();
        if (offlineSolo) this.connectSoloSocket();
        else this.connectSocket(targetUrl);
        await new Promise((resolve) => {
          if (this.socket.connected) {
            resolve();
            return;
          }
          const t = setTimeout(resolve, 4000);
          this.socket.once('connect', () => {
            clearTimeout(t);
            resolve();
          });
        });
      }

      if (!this.socket?.connected) {
        if (!offlineSolo) {
          alert(`Could not connect to game server:\n${targetUrl}\n\nIs npm run dev running? Is the Cloudflare tunnel still open?`);
        }
        return;
      }

      document.getElementById('start-screen').classList.remove('active');
      document.getElementById('hud').classList.add('active');

      // Pause (don't destroy) lobby WebGL previews — recreating them blanks the game canvas
      this._menuPreviews?.pause();

      this.music.setForMap(this.selectedMapId);
      this.music.start();
      this.ambients.start();
      this.sfx.start();
      this.sfx.setVolume(this.ambients.volume);
      this.ambients.setMode(this.activeCameraMode);
      this.socket.emit('joinGame', {
        ...this.customization,
        playerAngle: this.playerAngle,
        mapId: this.selectedMapId,
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

    // Escape menu: mute + volume + map switch
    this.bindEscapeMenu();
    this.bindMapSelectors();

    // 9. Keys: A/D rim walk, Space poke, E lasso, V camera, Esc menu, ~ dev mode
    window.addEventListener('keydown', (e) => {
      // Backquote / ~ toggles Dev Mode from anywhere (including setup screen)
      if (e.key === '`' || e.key === '~' || e.code === 'Backquote') {
        e.preventDefault();
        if (!e.repeat) this.devMode?.toggle();
        return;
      }

      if (document.getElementById('start-screen').classList.contains('active')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.devMode?.open) {
          this.devMode.setOpen(false);
          return;
        }
        if (!e.repeat) this.setMenuOpen(!this.menuOpen);
        return;
      }

      if (this.menuOpen || this.devMode?.open) return;
      if (e.target.matches('input, textarea, select')) return;

      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft' || e.key === 'Left') {
        if (e.key === 'ArrowLeft' || e.key === 'Left') e.preventDefault();
        this.keys.left = true;
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight' || e.key === 'Right') {
        if (e.key === 'ArrowRight' || e.key === 'Right') e.preventDefault();
        this.keys.right = true;
      } else if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) this.emitPokeBoat();
      } else if (e.key === 'e' || e.key === 'E') {
        if (!e.repeat) this.emitLassoBoat();
      } else if (e.key === 'v' || e.key === 'V') {
        this.cycleCameraMode();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft' || e.key === 'Left') {
        this.keys.left = false;
      }
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight' || e.key === 'Right') {
        this.keys.right = false;
      }
    });

    // 10. Pointer: click = stick push; right-drag / Alt-drag orbits; scroll zooms
    // Touch (gated): tap = poke, one-finger drag = orbit, pinch = zoom
    const isUiTarget = (target) =>
      !!target?.closest?.(
        'button, input, select, textarea, a, label, #mobile-controls, #sink-screen, #start-screen, #escape-menu, #dev-panel',
      );

    const applyOrbitDelta = (dx, dy) => {
      if (this.activeCameraMode === 'follow') {
        this.camYawOffset += dx * 0.0065;
        if (!(this.keys.left || this.keys.right)) {
          this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.0045, 0.12, 1.25);
        }
      } else if (this.activeCameraMode === 'followBoat') {
        this.camBoatYawOffset += dx * 0.005;
      }
    };

    window.addEventListener('pointerdown', (e) => {
      if (document.getElementById('start-screen').classList.contains('active')) return;
      if (this.menuOpen) return;
      if (isUiTarget(e.target)) return;

      // Double middle-click (mouse wheel button) resets camera framing
      if (e.button === 1) {
        const now = performance.now();
        if (now - this._lastMiddleClickAt < 350) {
          this.resetCameraView();
          this._lastMiddleClickAt = 0;
        } else {
          this._lastMiddleClickAt = now;
        }
        e.preventDefault();
        return;
      }

      if ((e.button === 2 || e.altKey) && this.activeCameraMode !== 'overview') {
        this._orbitDragging = true;
        this._lastPointerX = e.clientX;
        this._lastPointerY = e.clientY;
        e.preventDefault();
        return;
      }

      if (e.button === 0 && !e.altKey) {
        // Touch: defer poke until pointerup so drag can become orbit
        if (this.isTouchUi && e.pointerType === 'touch') {
          this._touchPtr = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            moved: false,
            orbiting: false,
          };
          this._cursorClient.x = e.clientX;
          this._cursorClient.y = e.clientY;
          this.updateCursorAim();
          e.preventDefault();
          return;
        }
        // Desktop left click = aimed stick push
        this.emitPokeBoat(e.clientX, e.clientY);
      }
    });

    // Block browser autoscroll / middle-click paste on the game surface
    window.addEventListener('auxclick', (e) => {
      if (e.button === 1 && !isUiTarget(e.target)) e.preventDefault();
    });

    window.addEventListener('pointermove', (e) => {
      this._cursorClient.x = e.clientX;
      this._cursorClient.y = e.clientY;
      this.updateCursorAim();

      // Touch pending poke → orbit once finger moves past slop
      if (
        this.isTouchUi &&
        this._touchPtr &&
        e.pointerId === this._touchPtr.id &&
        this.activeCameraMode !== 'overview'
      ) {
        const dx0 = e.clientX - this._touchPtr.x;
        const dy0 = e.clientY - this._touchPtr.y;
        if (!this._touchPtr.orbiting) {
          if (Math.hypot(dx0, dy0) >= TOUCH_ORBIT_SLOP) {
            this._touchPtr.orbiting = true;
            this._touchPtr.moved = true;
            this._orbitDragging = true;
            this._lastPointerX = e.clientX;
            this._lastPointerY = e.clientY;
          }
        } else {
          const dx = e.clientX - this._lastPointerX;
          const dy = e.clientY - this._lastPointerY;
          this._lastPointerX = e.clientX;
          this._lastPointerY = e.clientY;
          applyOrbitDelta(dx, dy);
        }
        return;
      }

      if (!this._orbitDragging) return;
      if (!e.altKey && (e.buttons & 2) === 0 && (e.buttons & 1) === 0) {
        this._orbitDragging = false;
        return;
      }

      const dx = e.clientX - this._lastPointerX;
      const dy = e.clientY - this._lastPointerY;
      this._lastPointerX = e.clientX;
      this._lastPointerY = e.clientY;
      applyOrbitDelta(dx, dy);
    });

    window.addEventListener('pointerup', (e) => {
      if (
        this.isTouchUi &&
        this._touchPtr &&
        e.pointerId === this._touchPtr.id
      ) {
        if (!this._touchPtr.orbiting && !this._touchPtr.moved) {
          this.emitPokeBoat(e.clientX, e.clientY);
        }
        this._touchPtr = null;
        this._orbitDragging = false;
        return;
      }
      if (e.button === 2 || e.buttons === 0) this._orbitDragging = false;
    });
    window.addEventListener('pointercancel', (e) => {
      if (this._touchPtr && e.pointerId === this._touchPtr.id) this._touchPtr = null;
      this._orbitDragging = false;
    });

    // Pinch-to-zoom (touch only)
    window.addEventListener(
      'touchstart',
      (e) => {
        if (!this.isTouchUi) return;
        if (document.getElementById('start-screen').classList.contains('active')) return;
        if (this.menuOpen || this.activeCameraMode === 'overview') return;
        if (e.touches.length === 2) {
          const a = e.touches[0];
          const b = e.touches[1];
          this._pinch = {
            dist0: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
            cam0: this.camDistance,
          };
          this._touchPtr = null;
          this._orbitDragging = false;
        }
      },
      { passive: true },
    );
    window.addEventListener(
      'touchmove',
      (e) => {
        if (!this.isTouchUi || !this._pinch || e.touches.length !== 2) return;
        const a = e.touches[0];
        const b = e.touches[1];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (this._pinch.dist0 < 1) return;
        const scale = this._pinch.dist0 / Math.max(1, dist);
        this.camDistance = Math.min(90, Math.max(16, this._pinch.cam0 * scale));
        if (this.activeCameraMode === 'followBoat') {
          this.camHeight = Math.max(10, this.camDistance * 0.42);
        }
      },
      { passive: true },
    );
    window.addEventListener(
      'touchend',
      (e) => {
        if (e.touches.length < 2) this._pinch = null;
      },
      { passive: true },
    );

    window.addEventListener('contextmenu', (e) => {
      if (document.getElementById('start-screen').classList.contains('active')) return;
      if (isUiTarget(e.target)) return;
      e.preventDefault();
    });

    window.addEventListener('wheel', (e) => {
      if (document.getElementById('start-screen').classList.contains('active')) return;
      if (this.activeCameraMode === 'overview') return;
      if (isUiTarget(e.target)) return;
      this.applyCamZoom(e.deltaY * 0.04);
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
    const sfxEl = document.getElementById('sfx-volume');
    const sfxLabel = document.getElementById('sfx-volume-label');

    const syncUi = () => {
      muteEl.checked = this.music.muted;
      volumeEl.value = String(Math.round(this.music.volume * 100));
      volumeLabel.textContent = `${Math.round(this.music.volume * 100)}%`;
      volumeRow?.classList.toggle('is-muted', this.music.muted);
      volumeEl.disabled = this.music.muted;
      if (sfxEl && sfxLabel) {
        sfxEl.value = String(Math.round(this.ambients.volume * 100));
        sfxLabel.textContent = `${Math.round(this.ambients.volume * 100)}%`;
      }
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

    sfxEl?.addEventListener('input', () => {
      const level = Number(sfxEl.value) / 100;
      this.ambients.setVolume(level);
      this.sfx.setVolume(level);
      syncUi();
    });

    document.getElementById('btn-resume').addEventListener('click', () => {
      this.setMenuOpen(false);
    });

    document.getElementById('btn-restart')?.addEventListener('click', () => {
      this.restartGame();
    });

    document.getElementById('btn-course-start')?.addEventListener('click', () => {
      const sel = document.getElementById('course-select');
      const courseId = sel?.value;
      if (!courseId || !this.socket) return;
      this.socket.emit('startCourse', { courseId });
    });

    document.getElementById('btn-course-abandon')?.addEventListener('click', () => {
      this.socket?.emit('abandonCourse');
    });

    document.getElementById('btn-change-map')?.addEventListener('click', () => {
      const sel = document.getElementById('escape-map-select');
      const mapId = normalizeMapId(sel?.value);
      if (!this.socket?.connected) return;
      if (mapId === this.map?.id) {
        this.setMenuOpen(false);
        return;
      }
      this.persistMapId(mapId);
      this.socket.emit('changeMap', { mapId });
      this.setMenuOpen(false);
      document.getElementById('sink-screen')?.classList.remove('active');
    });
  }

  bindMapSelectors() {
    const startOpts = document.getElementById('start-map-options');
    startOpts?.querySelectorAll('.map-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mapId = normalizeMapId(btn.dataset.mapId);
        this.persistMapId(mapId);
        // Preview scenery on the start screen when not in a session
        const onStart = document.getElementById('start-screen')?.classList.contains('active');
        if (onStart && !Object.keys(this.playerState).length) {
          this.rebuildWorld(getMap(mapId));
        }
        this.syncMapSelectorUI();
      });
    });

    const escapeSel = document.getElementById('escape-map-select');
    if (escapeSel && !escapeSel.dataset.filled) {
      escapeSel.innerHTML = '';
      for (const m of listMaps()) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        escapeSel.appendChild(opt);
      }
      escapeSel.dataset.filled = '1';
    }

    this.syncMapSelectorUI();
  }

  syncMapSelectorUI() {
    const id = this.selectedMapId || this.map?.id || DEFAULT_MAP_ID;
    document.querySelectorAll('#start-map-options .map-option-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mapId === id);
    });
    const escapeSel = document.getElementById('escape-map-select');
    if (escapeSel && escapeSel.value !== id) escapeSel.value = id;
    this.syncMapTitleUI(getMap(id));
  }

  /** Leave the session and return to the setup / Set Sail screen. */
  restartGame() {
    this.setMenuOpen(false);
    document.getElementById('sink-screen')?.classList.remove('active');
    document.getElementById('hud')?.classList.remove('active');
    document.getElementById('start-screen')?.classList.add('active');

    this.keys.left = false;
    this.keys.right = false;
    this._steerDir = 0;
    this._steerLean = 0;
    this._steerYaw = 0;
    this._orbitDragging = false;

    this.socket?.emit('steerBoat', { dir: 0 });
    this.socket?.emit('leaveGame');

    // Clear everyone from this client's scene; rejoining will re-sync
    const ids = new Set([
      ...Object.keys(this.playerState),
      ...Object.keys(this.boatMeshes),
      ...Object.keys(this.avatarMeshes),
    ]);
    for (const id of ids) {
      this.cleanPlayerVisuals(id);
      delete this.playerState[id];
      delete this.boatsData[id];
    }

    this.updateScoreHUD(0, 0);
    const dmgBar = document.getElementById('damage-bar');
    if (dmgBar) {
      dmgBar.style.width = '100%';
      dmgBar.style.background = '';
    }

    // Resume existing lobby previews (never recreate — that loses the main WebGL context)
    if (this._menuPreviews) {
      this._menuPreviews.resume();
    } else {
      this._menuPreviews = startMenuPreviews({ useStaticBoats: this.isTouchUi });
    }
  }

  setMenuOpen(open) {
    this.menuOpen = Boolean(open);
    document.getElementById('escape-menu').classList.toggle('active', this.menuOpen);
    this.music?.setSuspended(this.menuOpen);
    this.ambients?.setSuspended(this.menuOpen);
    this.sfx?.setSuspended(this.menuOpen);
    if (this.menuOpen) {
      releaseMobileKeys(this);
      this._orbitDragging = false;
      this._touchPtr = null;
      this._pinch = null;
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

  /**
   * Wind HUD relative to current view:
   * - Follow Player / Overview: sailor facing the basin
   * - Follow Boat: boat bow heading
   * Up on the dial = forward; right = starboard / player's right.
   */
  updateWindVaneHUD() {
    const arrow = document.getElementById('wind-vane-arrow');
    const speed = document.getElementById('wind-speed');
    const phaseEl = document.getElementById('wind-phase');
    if (arrow && speed) {
      let facing;
      if (this.activeCameraMode === 'followBoat') {
        const boat = this.localId ? this.boatsData[this.localId] : null;
        facing = Number.isFinite(boat?.angle)
          ? boat.angle
          : this.playerAngle + Math.PI;
      } else {
        // Avatar faces the basin center (lookAt origin) → facing = rimAngle + π
        facing = this.playerAngle + Math.PI;
      }
      const fwdX = Math.cos(facing);
      const fwdZ = Math.sin(facing);
      const rightX = Math.cos(facing + Math.PI / 2);
      const rightZ = Math.sin(facing + Math.PI / 2);
      const wx = Math.cos(this.wind.angle || 0);
      const wz = Math.sin(this.wind.angle || 0);
      const forwardComp = wx * fwdX + wz * fwdZ;
      const rightComp = wx * rightX + wz * rightZ;
      // φ = 0 → wind blows forward (up on dial); φ = π/2 → right
      const phi = Math.atan2(rightComp, forwardComp);
      // Glyph ➔ points right at 0°; map φ=0 (forward) → −90° (up)
      const degrees = (phi * 180) / Math.PI - 90;
      arrow.style.transform = `rotate(${degrees}deg)`;
      speed.textContent = `${this.wind.speed.toFixed(1)} kn`;
    }
    if (phaseEl) phaseEl.textContent = this.wind.phase || 'breeze';
  }

  clearWindSock() {
    if (!this.windSock) return;
    const { root } = this.windSock;
    if (root?.parent) root.parent.remove(root);
    this.windSock = null;
  }

  /** Mount a windsock on a small island (Paris fountain only). Scene-parented so yaw is unambiguous. */
  attachParisWindSock(spawned) {
    this.clearWindSock();
    const mapId = this.map?.id || this.selectedMapId;
    const isParis = mapId === 'paris_fountain' || this.map?.sceneryKey === 'paris';
    if (!isParis) return;

    const list = (spawned || []).filter(Boolean);
    const host =
      list.find(({ obs }) => obs.type === 'island')
      || list.find(({ obs }) => obs.type === 'lighthouse')
      || list.find(({ obs }) => obs.type === 'boathouse')
      || list.find(({ obs }) => obs.type === 'rock');
    if (!host) {
      console.warn('[windsock] No island host found on Paris map');
      return;
    }

    const { obs } = host;
    const sock = createWindSock(obs.radius);
    // World position on the grass cap (not parented to randomly-rotated island)
    const y = obs.radius * 0.55;
    sock.position.set(obs.x, y, obs.y);
    this.scene.add(sock);

    this.windSock = {
      root: sock,
      sleeve: sock.userData.sleeve,
    };
    this.updateWindSock(true);
  }

  /**
   * Boat pennant streams downwind (same convention as wind sock).
   * Flag local +X; world yaw ≈ boat.yaw + flag.yaw → −wind.angle.
   */
  updateBoatFlag(mesh, time, id) {
    let flag = mesh.userData.boatFlag;
    if (!flag) {
      flag = mesh.getObjectByName('BoatFlag');
      if (!flag) return;
      mesh.userData.boatFlag = flag;
    }
    const targetYaw = -(this.wind.angle || 0) - mesh.rotation.y;
    let diff = targetYaw - flag.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    flag.rotation.y += diff * 0.16;

    const flutter = Math.min(0.14, (this.wind.speed || 0) * 0.012)
      * (this.wind.phase === 'gust' ? 1.6 : this.wind.phase === 'lull' ? 0.4 : 1);
    const phase = time * 10 + (id?.charCodeAt?.(0) || 0);
    flag.rotation.z = Math.sin(phase) * flutter;
    flag.rotation.x = Math.cos(phase * 0.7) * flutter * 0.35;
  }

  /**
   * Sleeve tip streams downwind.
   * Sim wind (cos θ, sin θ) on XZ; sleeve local +X → rotation.y = −θ.
   */
  updateWindSock(snap = false) {
    const sock = this.windSock;
    if (!sock?.sleeve) return;
    const targetYaw = -(this.wind.angle || 0);
    if (snap) {
      sock.sleeve.rotation.y = targetYaw;
    } else {
      // Ease toward wind so turns read clearly
      let diff = targetYaw - sock.sleeve.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      sock.sleeve.rotation.y += diff * 0.12;
    }
    const fill = 0.9 + Math.min(0.35, (this.wind.speed || 5) * 0.025);
    const gust = this.wind.phase === 'gust' ? 1.08 : this.wind.phase === 'lull' ? 0.92 : 1;
    sock.sleeve.scale.set(fill * gust, 1, 1);
  }

  populateCourseSelect(courses) {
    this.courseCatalog = courses || [];
    const sel = document.getElementById('course-select');
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Free play</option>';
    for (const c of this.courseCatalog) {
      const opt = document.createElement('option');
      opt.value = c.id;
      const pb = this.readCourseBest(c.id);
      const pbLabel = pb != null ? ` · PB ${(pb / 1000).toFixed(1)}s` : '';
      opt.textContent = `${c.name}${pbLabel}`;
      opt.title = c.blurb || '';
      sel.append(opt);
    }
    if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  readCourseBest(courseId) {
    try {
      const raw = localStorage.getItem(`tbtb.courseBest.${courseId}`);
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  recordCourseBest(courseId, timeMs) {
    const prev = this.readCourseBest(courseId);
    let isNew = false;
    if (prev == null || timeMs < prev) {
      try {
        localStorage.setItem(`tbtb.courseBest.${courseId}`, String(timeMs));
      } catch {
        /* ignore */
      }
      isNew = true;
    }
    return { bestMs: this.readCourseBest(courseId) ?? timeMs, isNew };
  }

  setCourseUiActive(active) {
    const start = document.getElementById('btn-course-start');
    const abandon = document.getElementById('btn-course-abandon');
    const sel = document.getElementById('course-select');
    if (start) start.hidden = active;
    if (abandon) abandon.hidden = !active;
    if (sel) sel.disabled = active;
  }

  setCourseStatus(text) {
    const el = document.getElementById('course-status');
    if (el) el.textContent = text || '';
  }

  spawnSplashRipple(x, y, strength = 1) {
    if (!this.scene) return;
    const r = 1.2 + strength * 1.4;
    const geo = new THREE.RingGeometry(r * 0.4, r, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.4, y);
    this.scene.add(mesh);
    this._splashRipples.push({ mesh, age: 0, life: 0.7 });
  }

  /** Floating +points above the boat; rises and fades out. */
  spawnScorePopup(x, z, text) {
    if (!this.scene) return;
    const el = document.createElement('div');
    el.className = 'ring-score-popup';
    el.textContent = text;
    const label = new CSS2DObject(el);
    label.position.set(x, 4.2, z);
    this.scene.add(label);
    this._scorePopups.push({
      label,
      el,
      age: 0,
      life: 1.15,
      startY: 4.2,
    });
  }

  /** Bob and gently rock buoy obstacles on the water. */
  updateBuoyBob(time) {
    for (const id in this.obstacleMeshes) {
      const mesh = this.obstacleMeshes[id];
      if (!mesh || mesh.userData.kind !== 'buoy') continue;
      const phase = mesh.userData.bobPhase || 0;
      const speed = mesh.userData.bobSpeed || 2;
      const amp = mesh.userData.bobAmp || 0.14;
      const tilt = mesh.userData.tiltAmp || 0.07;
      const baseY = mesh.userData.baseY ?? 0.05;
      const t = time * speed + phase;
      mesh.position.y = baseY + Math.sin(t) * amp;
      mesh.rotation.x = Math.sin(t * 0.85) * tilt;
      mesh.rotation.z = Math.cos(t * 0.7) * tilt;
    }
  }

  /** Soft quack when the local boat first brushes a duck. */
  updateDuckQuacks() {
    const boat = this.localId ? this.boatMeshes[this.localId] : null;
    if (!boat || !this.mapWorld || boat.visible === false) return;
    const bx = boat.position.x;
    const bz = boat.position.z;
    const hitR2 = 2.4 * 2.4;
    this.mapWorld.traverse((obj) => {
      const kind = obj.userData?.kind;
      if (kind !== 'duck' && kind !== 'duckMom' && kind !== 'duckling') return;
      obj.getWorldPosition(this._duckWorldPos);
      const dx = this._duckWorldPos.x - bx;
      const dz = this._duckWorldPos.z - bz;
      const overlapping = dx * dx + dz * dz <= hitR2;
      if (overlapping && !obj.userData.boatOverlapping) {
        this.sfx?.playQuack();
      }
      obj.userData.boatOverlapping = overlapping;
    });
  }

  updateCourseRingHighlight(time) {
    const nextId = this._courseNextRingId;
    for (const id in this.obstacleMeshes) {
      const mesh = this.obstacleMeshes[id];
      if (!mesh || mesh.userData.obstacleType !== 'ring') continue;
      const base = mesh.userData.baseScale || 1;
      if (id === nextId) {
        const pulse = 1 + Math.sin(time * 5) * 0.08;
        mesh.scale.setScalar(base * pulse);
        mesh.traverse((child) => {
          if (child.isMesh && child.material && 'emissive' in child.material) {
            child.material.emissive?.setHex?.(0x332211);
            if ('emissiveIntensity' in child.material) child.material.emissiveIntensity = 0.35;
          }
        });
      } else {
        mesh.scale.setScalar(base);
        mesh.traverse((child) => {
          if (child.isMesh && child.material && 'emissiveIntensity' in child.material) {
            child.material.emissiveIntensity = 0;
          }
        });
      }
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastFrameTime) / 1000);
    this._lastFrameTime = now;
    const time = clock.getElapsedTime();

    // A/D / arrows: walk the rim (Follow Player / Overview), or steer boat (Follow Boat)
    const onStart = document.getElementById('start-screen')?.classList.contains('active');
    const followBoat = this.activeCameraMode === 'followBoat';
    const steeringBoat = !this.menuOpen && !onStart && followBoat;
    const dir = (this.keys.left ? 1 : 0) + (this.keys.right ? -1 : 0);

    if (steeringBoat) {
      this.sfx?.setMoving(false);
      if (dir !== this._steerDir) {
        this._steerDir = dir;
        this.socket?.emit('steerBoat', { dir });
      }
    } else {
      if (this._steerDir !== 0) {
        this._steerDir = 0;
        this.socket?.emit('steerBoat', { dir: 0 });
      }
      // No rim walking in Follow Boat — A/D are boat steer only
      const walking = !followBoat && !this.menuOpen && !onStart && dir !== 0;
      this.sfx?.setMoving(walking);
      if (walking) {
        // Facing the fountain: left = clockwise, right = counter-clockwise
        this.playerAngle += dir * WALK_SPEED * (dt * 60);
        this.onPlayerMove();
      }
    }

    // Center fountain water jets + map wildlife
    if (this.centerFountain) {
      updateCenterFountain(this.centerFountain, time);
    }
    if (this.mapWorld) {
      updateMapAmbience(this.mapWorld, time, this.ambientBoats);
    }
    this.updateBuoyBob(time);
    this.updateDuckQuacks();
    this.updateWindSock();
    // Wind dial tracks rim walk / facing every frame (not only on network wind ticks)
    this.updateWindVaneHUD();

    // 1. Soft water glint — roughness tracks wind speed
    if (this.waterMat) {
      const windBoost = Math.min(0.12, (this.wind.speed || 5) * 0.008);
      const gustBoost = this.wind.phase === 'gust' ? 0.04 : this.wind.phase === 'lull' ? -0.03 : 0;
      this.waterMat.roughness = 0.2 + Math.sin(time) * 0.03 + windBoost + gustBoost;
    }

    this.updateCourseRingHighlight(time);

    for (let i = this._splashRipples.length - 1; i >= 0; i--) {
      const r = this._splashRipples[i];
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry?.dispose?.();
        r.mesh.material?.dispose?.();
        this._splashRipples.splice(i, 1);
        continue;
      }
      r.mesh.scale.setScalar(1 + t * 2.2);
      r.mesh.material.opacity = 0.55 * (1 - t);
    }

    for (let i = this._scorePopups.length - 1; i >= 0; i--) {
      const p = this._scorePopups[i];
      p.age += dt;
      const t = Math.min(1, p.age / p.life);
      p.label.position.y = p.startY + t * 5.5;
      // Hold readable, then fade
      const fade = t < 0.35 ? 1 : 1 - (t - 0.35) / 0.65;
      p.el.style.opacity = String(Math.max(0, fade));
      p.el.style.transform = `translateY(${-t * 8}px) scale(${1 + t * 0.12})`;
      if (t >= 1) {
        this.scene.remove(p.label);
        p.el.remove();
        this._scorePopups.splice(i, 1);
      }
    }

    // 2. Interpolate boat positions and animate them floating/bobbing
    const windLean = Math.min(0.08, (this.wind.speed || 0) * 0.006)
      * (this.wind.phase === 'gust' ? 1.4 : this.wind.phase === 'lull' ? 0.3 : 1);
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
          const tiltZ = Math.sin(time * 1.2 + id.charCodeAt(0)) * 0.03
            + Math.sin(this.wind.angle - data.angle) * windLean;

          // Follow server closely so local lerp doesn't slide hulls into solids
          mesh.position.x += (data.x - mesh.position.x) * 0.4;
          mesh.position.y += (bobHeight - mesh.position.y) * 0.15;
          mesh.position.z += (data.y - mesh.position.z) * 0.4;

          // Rudder feel: subtle heel + slight nose yaw into the turn (local boat only)
          if (id === this.localId) {
            const targetLean = this._steerDir * 0.12; // A/left → port, D/right → starboard
            const targetYaw = -this._steerDir * 0.08; // rotate slightly into the turn
            this._steerLean += (targetLean - this._steerLean) * 0.14;
            this._steerYaw += (targetYaw - this._steerYaw) * 0.14;
          }
          const steerLean = id === this.localId ? this._steerLean : 0;
          const steerYaw = id === this.localId ? this._steerYaw : 0;

          let angleDiff = data.angle + steerYaw - mesh.rotation.y;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          // Follow Boat needs instant yaw so the stern camera stays locked while steering
          const yawLerp = (id === this.localId && this.activeCameraMode === 'followBoat')
            ? 1
            : 0.35;
          mesh.rotation.y += angleDiff * yawLerp;

          // YXZ: yaw, heel around length (X), pitch bob around beam (Z)
          mesh.rotation.order = 'YXZ';
          mesh.rotation.x = tiltX + steerLean;
          mesh.rotation.z = tiltZ;

          this.updateBoatFlag(mesh, time, id);
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
        const rim = this.pathPos(state.angle);
        const targetX = rim.x;
        const targetZ = rim.z;

        const prevX = avatar.position.x;
        const prevZ = avatar.position.z;
        avatar.position.x += (targetX - avatar.position.x) * 0.22;
        avatar.position.z += (targetZ - avatar.position.z) * 0.22;
        avatar.position.y = 0;

        const moveDx = avatar.position.x - prevX;
        const moveDz = avatar.position.z - prevZ;
        const moveSpeed = Math.hypot(moveDx, moveDz);
        // Local: rim-walk anim only outside Follow Boat (A/D steer the hull there)
        const isMoving = id === this.localId
          ? this.activeCameraMode !== 'followBoat'
            && (this.keys.left || this.keys.right)
            && !this.menuOpen
          : moveSpeed > 0.006;

        controller?.setMoving(isMoving);
        controller?.update(dt, now);

        if (isMoving) {
          // Face along the path tangent while walking
          const lookX = avatar.position.x + moveDx * 20;
          const lookZ = avatar.position.z + moveDz * 20;
          avatar.lookAt(lookX, 0, lookZ);
        } else if (boat) {
          // When stopped, always face the boat
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
            this.pokeAnimations[id] += dt;
            const animProgress = this.pokeAnimations[id] / POKE_ANIM_SEC;
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

    // 5. Lasso rope visuals
    this.updateLassoVisuals(dt);

    // 6. Camera
    this.updateCameraPosition();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}

// Global clock for helper animations
const clock = new THREE.Clock();
