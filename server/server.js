import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/health', (req, res) => {
  res.send({ status: 'ok' });
});

// Game UI is the Vite client (dev: :5181). Socket server alone has no page at /.
app.get('/', (req, res) => {
  res.redirect(302, 'http://localhost:5181/');
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Game World Constants
const FOUNTAIN_RADIUS = 100;
const INNER_PATH_RADIUS = 104.5; // Path where children walk (just outside wider rim)
// Visual centerpiece ~radius 12–13; add margin so boat bows (length up to ~7) don't clip stone
const CENTER_FOUNTAIN_RADIUS = 20;
const POKE_RANGE = FOUNTAIN_RADIUS; // half the fountain diameter
/** Live-tunable physics (Dev Mode ~). Mutated at runtime; defaults restored via reset. */
const TUNABLES = {
  sailAccel: 0.0007,
  leeway: 0.00025,
  pokeImpulse: 0.62,
  pokeYawKick: 0.2,
  angularDrag: 0.88,
  maxOmega: 0.12,
  pokeYawHold: 0.9,
  weathercockMaxStep: 0.03,
  windAuto: true,
  windChangeMin: 10,
  windChangeMax: 25,
};
const TUNABLES_DEFAULTS = JSON.parse(JSON.stringify(TUNABLES));
const LASSO_RANGE = FOUNTAIN_RADIUS;
const LASSO_PULL = 22; // pull strength toward the sailor while reeling
const LASSO_DURATION = 0.9; // seconds of active reel
const LASSO_COOLDOWN = 1.6;
const DRAG = 0.96; // Water friction coefficient
const COLLISION_DAMAGE = 15;
const BOAT_HIT_RADIUS = 5; // max accepted click offset from boat center
const BOAT_RADIUS = 3.6; // half longest wood-boat extent (~5.5–7)
const MAX_BOAT_SPEED = 2.8; // cap to reduce tunneling through solids
const COLLISION_ITERS = 4;
const BOUNCE = 0.55;
const BOT_WALK_SPEED = 0.28; // rad/s along the rim
const BOT_TYPES = ['standard', 'cutter', 'pirate'];
const BOT_CHARS = ['boy', 'girl'];
const BOT_SYMBOLS = ['star', 'heart', 'anchor', 'moon'];
const BOT_STICKS = ['wooden', 'brass', 'ribbon'];

/** Per boatType: sailing feel on the water */
const BOAT_STATS = {
  standard: {
    // Wood Sailboat — balanced
    maxSpeed: 2.8,
    drag: 0.96,
    windCatch: 1.0,
    mass: 1.0,
    durability: 1.0,
    turnRate: 0.1,
  },
  cutter: {
    // Sloop — quick, catches wind, fragile
    maxSpeed: 3.45,
    drag: 0.968, // keeps speed (less water friction)
    windCatch: 1.3,
    mass: 0.82,
    durability: 0.72,
    turnRate: 0.145,
  },
  pirate: {
    // Small Ship — heavy tank, slow through water
    maxSpeed: 2.15,
    drag: 0.948, // heavier water resistance
    windCatch: 0.75,
    mass: 1.4,
    durability: 1.45,
    turnRate: 0.065,
  },
};

/** Per stickType: poke feel */
const STICK_STATS = {
  wooden: {
    // Hickory Branch — steady all-rounder
    power: 1.0,
    accuracy: 1.0,
    softness: 1.0,
  },
  brass: {
    // Polished Brass — hard shove, wilder aim
    power: 1.5,
    accuracy: 0.65,
    softness: 1.35,
  },
  ribbon: {
    // Ribbon Cane — gentle, precise guide
    power: 0.68,
    accuracy: 1.45,
    softness: 0.5,
  },
};

function getBoatStats(boat) {
  const type = boat?.customization?.boatType || 'standard';
  return BOAT_STATS[type] || BOAT_STATS.standard;
}

function getStickStats(boat) {
  const type = boat?.customization?.stickType || 'wooden';
  return STICK_STATS[type] || STICK_STATS.wooden;
}

const BOAT_STATS_DEFAULTS = JSON.parse(JSON.stringify(BOAT_STATS));
const STICK_STATS_DEFAULTS = JSON.parse(JSON.stringify(STICK_STATS));

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function getDevSettings() {
  return {
    weather: {
      angle: wind.angle,
      speed: wind.speed,
      autoChange: TUNABLES.windAuto,
      changeMinSec: TUNABLES.windChangeMin,
      changeMaxSec: TUNABLES.windChangeMax,
      sailAccel: TUNABLES.sailAccel,
      leeway: TUNABLES.leeway,
    },
    environment: {
      pokeImpulse: TUNABLES.pokeImpulse,
      pokeYawKick: TUNABLES.pokeYawKick,
      angularDrag: TUNABLES.angularDrag,
      maxOmega: TUNABLES.maxOmega,
      pokeYawHold: TUNABLES.pokeYawHold,
      weathercockMaxStep: TUNABLES.weathercockMaxStep,
    },
    boats: JSON.parse(JSON.stringify(BOAT_STATS)),
    sticks: JSON.parse(JSON.stringify(STICK_STATS)),
  };
}

function applyDevSettings(data = {}) {
  if (data.weather && typeof data.weather === 'object') {
    const w = data.weather;
    if (w.angle != null) {
      wind.angle = clampNum(w.angle, -Math.PI * 2, Math.PI * 2, wind.angle);
      wind.targetAngle = wind.angle;
    }
    if (w.speed != null) {
      wind.speed = clampNum(w.speed, 0, 30, wind.speed);
      wind.targetSpeed = wind.speed;
    }
    if (typeof w.autoChange === 'boolean') TUNABLES.windAuto = w.autoChange;
    if (w.changeMinSec != null) TUNABLES.windChangeMin = clampNum(w.changeMinSec, 1, 120, TUNABLES.windChangeMin);
    if (w.changeMaxSec != null) TUNABLES.windChangeMax = clampNum(w.changeMaxSec, 1, 180, TUNABLES.windChangeMax);
    if (TUNABLES.windChangeMax < TUNABLES.windChangeMin) {
      TUNABLES.windChangeMax = TUNABLES.windChangeMin;
    }
    if (w.sailAccel != null) TUNABLES.sailAccel = clampNum(w.sailAccel, 0, 0.05, TUNABLES.sailAccel);
    if (w.leeway != null) TUNABLES.leeway = clampNum(w.leeway, 0, 0.05, TUNABLES.leeway);
  }

  if (data.environment && typeof data.environment === 'object') {
    const e = data.environment;
    if (e.pokeImpulse != null) TUNABLES.pokeImpulse = clampNum(e.pokeImpulse, 0, 5, TUNABLES.pokeImpulse);
    if (e.pokeYawKick != null) TUNABLES.pokeYawKick = clampNum(e.pokeYawKick, 0, 2, TUNABLES.pokeYawKick);
    if (e.angularDrag != null) TUNABLES.angularDrag = clampNum(e.angularDrag, 0.5, 0.999, TUNABLES.angularDrag);
    if (e.maxOmega != null) TUNABLES.maxOmega = clampNum(e.maxOmega, 0, 1, TUNABLES.maxOmega);
    if (e.pokeYawHold != null) TUNABLES.pokeYawHold = clampNum(e.pokeYawHold, 0, 5, TUNABLES.pokeYawHold);
    if (e.weathercockMaxStep != null) {
      TUNABLES.weathercockMaxStep = clampNum(e.weathercockMaxStep, 0, 0.5, TUNABLES.weathercockMaxStep);
    }
  }

  if (data.boats && typeof data.boats === 'object') {
    for (const type of Object.keys(BOAT_STATS)) {
      const src = data.boats[type];
      if (!src || typeof src !== 'object') continue;
      const dst = BOAT_STATS[type];
      if (src.maxSpeed != null) dst.maxSpeed = clampNum(src.maxSpeed, 0.2, 12, dst.maxSpeed);
      if (src.drag != null) dst.drag = clampNum(src.drag, 0.8, 0.999, dst.drag);
      if (src.windCatch != null) dst.windCatch = clampNum(src.windCatch, 0, 4, dst.windCatch);
      if (src.mass != null) dst.mass = clampNum(src.mass, 0.2, 5, dst.mass);
      if (src.durability != null) dst.durability = clampNum(src.durability, 0.2, 5, dst.durability);
      if (src.turnRate != null) dst.turnRate = clampNum(src.turnRate, 0, 1, dst.turnRate);
    }
  }

  if (data.sticks && typeof data.sticks === 'object') {
    for (const type of Object.keys(STICK_STATS)) {
      const src = data.sticks[type];
      if (!src || typeof src !== 'object') continue;
      const dst = STICK_STATS[type];
      if (src.power != null) dst.power = clampNum(src.power, 0, 4, dst.power);
      if (src.accuracy != null) dst.accuracy = clampNum(src.accuracy, 0.2, 3, dst.accuracy);
      if (src.softness != null) dst.softness = clampNum(src.softness, 0, 3, dst.softness);
    }
  }

  return getDevSettings();
}

function resetDevSettings() {
  Object.assign(TUNABLES, JSON.parse(JSON.stringify(TUNABLES_DEFAULTS)));
  for (const type of Object.keys(BOAT_STATS_DEFAULTS)) {
    Object.assign(BOAT_STATS[type], BOAT_STATS_DEFAULTS[type]);
  }
  for (const type of Object.keys(STICK_STATS_DEFAULTS)) {
    Object.assign(STICK_STATS[type], STICK_STATS_DEFAULTS[type]);
  }
  wind.targetAngle = wind.angle;
  wind.targetSpeed = wind.speed;
  return getDevSettings();
}

// Game State
const players = {};
const obstacles = [];
let botSerial = 0;
let wind = {
  angle: 0,
  speed: 5,
  targetAngle: 0,
  targetSpeed: 5,
  changeTimer: 0
};

const RING_CLEAR_POINTS = 5;
const RING_STREAK_BONUS = 20;
const RING_STREAK_TARGET = 3;

function placementClearOf(existing, x, y, minDist) {
  for (const o of existing) {
    if (Math.hypot(x - o.x, y - o.y) < minDist) return false;
  }
  return true;
}

// Generate static obstacles in the fountain
function generateObstacles() {
  const count = 12;
  for (let i = 0; i < count; i++) {
    // Keep clear of the center fountain and the outer rim
    let x;
    let y;
    let placed = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const distance = 28 + Math.random() * 55;
      const angle = Math.random() * Math.PI * 2;
      x = Math.cos(angle) * distance;
      y = Math.sin(angle) * distance;
      if (placementClearOf(obstacles, x, y, 10)) {
        placed = true;
        break;
      }
    }
    if (!placed) continue;

    // Prefer miniature islands (some with lighthouses) over old grey rocks
    const roll = Math.random();
    let type;
    let radius;
    if (roll < 0.55) {
      type = Math.random() < 0.4 ? 'lighthouse' : 'island';
      radius = 4.2 + Math.random() * 2.8;
    } else if (roll < 0.7) {
      type = 'buoy';
      radius = 2;
    } else if (roll < 0.85) {
      type = 'leaf';
      radius = 4;
    } else {
      type = 'lilypad';
      radius = 3;
    }

    obstacles.push({
      id: `obs_${i}`,
      x,
      y,
      radius,
      type
    });
  }

  // Scoring rings — striped hoops boats sail through
  const ringCount = 6;
  for (let i = 0; i < ringCount; i++) {
    let x;
    let y;
    let placed = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const distance = 32 + Math.random() * 48;
      const angle = Math.random() * Math.PI * 2;
      x = Math.cos(angle) * distance;
      y = Math.sin(angle) * distance;
      if (placementClearOf(obstacles, x, y, 14)) {
        placed = true;
        break;
      }
    }
    if (!placed) continue;

    const aperture = 3.0 + Math.random() * 0.7;
    obstacles.push({
      id: `ring_${i}`,
      x,
      y,
      radius: aperture,
      innerRadius: aperture,
      facing: Math.random() * Math.PI * 2,
      type: 'ring',
    });
  }
}
generateObstacles();

function randomHexColor() {
  return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
}

const BOT_FIRST = [
  'Lucie', 'Pierre', 'Camille', 'Hugo', 'Léa', 'Louis', 'Chloé', 'Gabriel',
  'Manon', 'Jules', 'Inès', 'Arthur', 'Nina', 'Raphaël', 'Zoé', 'Paul',
];
const BOT_LAST = [
  'Petit', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Lefevre', 'Roux',
  'Fournier', 'Girard', 'Bonnet', 'Dupont', 'Lambert',
];

function sanitizePlayerName(name) {
  const cleaned = String(name ?? '')
    .replace(/[^\p{L}\p{N} _'-]/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 16);
  return cleaned || 'Sailor';
}

function randomBotName(used = new Set()) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const first = BOT_FIRST[Math.floor(Math.random() * BOT_FIRST.length)];
    const last = BOT_LAST[Math.floor(Math.random() * BOT_LAST.length)];
    const full = Math.random() < 0.55 ? `${first} ${last}` : first;
    const name = full.slice(0, 16);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return `Sailor ${Math.floor(Math.random() * 90) + 10}`;
}

function randomCustomization(playerName) {
  return {
    playerName: playerName || randomBotName(),
    characterType: BOT_CHARS[Math.floor(Math.random() * BOT_CHARS.length)],
    boatType: BOT_TYPES[Math.floor(Math.random() * BOT_TYPES.length)],
    boatColor: randomHexColor(),
    flagColor: randomHexColor(),
    flagSymbol: BOT_SYMBOLS[Math.floor(Math.random() * BOT_SYMBOLS.length)],
    stickColor: randomHexColor(),
    stickType: BOT_STICKS[Math.floor(Math.random() * BOT_STICKS.length)],
  };
}

function hasHumanPlayers() {
  return Object.values(players).some((p) => p && !p.isBot && p.isPlaying);
}

function countBots() {
  return Object.values(players).filter((p) => p?.isBot).length;
}

/** Place boat just inside the rim, aligned with the child on the path. */
function boatSpawnBesidePlayer(playerAngle) {
  // As close to INNER_PATH_RADIUS as rim collision allows (~6 units from the sailor)
  const spawnDist = FOUNTAIN_RADIUS - BOAT_RADIUS - 0.15;
  return {
    x: Math.cos(playerAngle) * spawnDist,
    y: Math.sin(playerAngle) * spawnDist,
    angle: playerAngle + Math.PI, // bow toward center; stern toward the sailor
  };
}

function createBoatAtAngle(playerAngle, customization, scoreCarry = 0) {
  const spawn = boatSpawnBesidePlayer(playerAngle);
  return {
    x: spawn.x,
    y: spawn.y,
    prevX: spawn.x,
    prevY: spawn.y,
    vx: 0,
    vy: 0,
    omega: 0, // rad/tick yaw rate
    pokeYawHold: 0, // suppress weathercock briefly after a poke
    angle: spawn.angle,
    damage: 100,
    isSunk: false,
    score: scoreCarry,
    ringStreak: 0,
    ringCooldowns: {},
    customization,
  };
}

/** Award points when a boat sails through a ring aperture. */
function checkRingClears(boat, playerId) {
  if (boat.score == null) boat.score = 0;
  if (boat.ringStreak == null) boat.ringStreak = 0;
  if (!boat.ringCooldowns) boat.ringCooldowns = {};

  const prevX = boat.prevX ?? boat.x;
  const prevY = boat.prevY ?? boat.y;

  for (const obs of obstacles) {
    if (obs.type !== 'ring') continue;

    const aperture = obs.innerRadius ?? obs.radius;
    const exitR = aperture * 1.35;
    const currDist = Math.hypot(boat.x - obs.x, boat.y - obs.y);

    if (boat.ringCooldowns[obs.id]) {
      if (currDist > exitR) delete boat.ringCooldowns[obs.id];
      continue;
    }

    // Cross the ring's facing plane while inside the aperture
    const nx = Math.cos(obs.facing);
    const ny = Math.sin(obs.facing);
    const prevSide = (prevX - obs.x) * nx + (prevY - obs.y) * ny;
    const currSide = (boat.x - obs.x) * nx + (boat.y - obs.y) * ny;
    if (prevSide * currSide >= 0) continue;

    const denom = prevSide - currSide;
    if (Math.abs(denom) < 1e-8) continue;
    const t = prevSide / denom;
    if (t < 0 || t > 1) continue;
    const ix = prevX + (boat.x - prevX) * t;
    const iy = prevY + (boat.y - prevY) * t;
    if (Math.hypot(ix - obs.x, iy - obs.y) > aperture) continue;

    boat.score += RING_CLEAR_POINTS;
    boat.ringStreak += 1;
    boat.ringCooldowns[obs.id] = true;

    let bonus = 0;
    if (boat.ringStreak >= RING_STREAK_TARGET) {
      bonus = RING_STREAK_BONUS;
      boat.score += bonus;
      boat.ringStreak = 0;
    }

    io.to(playerId).emit('ringCleared', {
      obstacleId: obs.id,
      points: RING_CLEAR_POINTS,
      bonus,
      score: boat.score,
      ringStreak: boat.ringStreak,
    });
  }
}

/** Spawn 3–5 AI kids + boats when a level starts (first human sails). */
function spawnComputerPlayers() {
  if (countBots() > 0) return;

  const count = 3 + Math.floor(Math.random() * 3); // 3–5
  const usedNames = new Set();
  for (const p of Object.values(players)) {
    const n = p?.boat?.customization?.playerName;
    if (n) usedNames.add(n);
  }
  for (let i = 0; i < count; i++) {
    const id = `bot_${botSerial++}`;
    const playerAngle = Math.random() * Math.PI * 2;
    const customization = randomCustomization(randomBotName(usedNames));
    players[id] = {
      id,
      isBot: true,
      isPlaying: true,
      playerAngle,
      boat: createBoatAtAngle(playerAngle, customization),
      bot: {
        dir: Math.random() < 0.5 ? -1 : 1,
        dirTimer: 1 + Math.random() * 3,
        pokeTimer: 2 + Math.random() * 4,
        respawnTimer: 0,
      },
    };
  }
  console.log(`Spawned ${count} computer players`);
}

function clearComputerPlayers() {
  const botIds = Object.keys(players).filter((id) => players[id]?.isBot);
  for (const id of botIds) {
    delete players[id];
    io.emit('playerLeft', { id });
  }
}

function applyBoatPoke(playerId, hitX, hitY) {
  const player = players[playerId];
  if (!player || !player.isPlaying || !player.boat || player.boat.isSunk) return false;

  const boat = player.boat;
  const boatStats = getBoatStats(boat);
  const stick = getStickStats(boat);

  const px = Math.cos(player.playerAngle) * INNER_PATH_RADIUS;
  const py = Math.sin(player.playerAngle) * INNER_PATH_RADIUS;

  const toBoatX = boat.x - px;
  const toBoatY = boat.y - py;
  const distToBoat = Math.sqrt(toBoatX * toBoatX + toBoatY * toBoatY);
  if (distToBoat > POKE_RANGE) return false;

  // Low accuracy pulls the contact toward the hull center (harder to place fine nudges)
  const accuracy = Math.max(0.35, stick.accuracy);
  const centerPull = Math.max(0, 1.15 - accuracy);
  let aimX = hitX + (boat.x - hitX) * centerPull;
  let aimY = hitY + (boat.y - hitY) * centerPull;

  let ox = aimX - boat.x;
  let oy = aimY - boat.y;
  let hitDist = Math.sqrt(ox * ox + oy * oy);
  if (hitDist > BOAT_HIT_RADIUS) return false;

  let dx = aimX - px;
  let dy = aimY - py;
  let dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) {
    dx = toBoatX || Math.cos(player.playerAngle + Math.PI);
    dy = toBoatY || Math.sin(player.playerAngle + Math.PI);
    dist = Math.sqrt(dx * dx + dy * dy) || 1;
  }

  let pushX = dx / dist;
  let pushY = dy / dist;

  // Inaccurate sticks spray the shove direction a bit
  if (accuracy < 1) {
    const spray = (1 - accuracy) * 0.55;
    const sprayAngle = (Math.random() - 0.5) * spray;
    const cos = Math.cos(sprayAngle);
    const sin = Math.sin(sprayAngle);
    const rx = pushX * cos - pushY * sin;
    const ry = pushX * sin + pushY * cos;
    pushX = rx;
    pushY = ry;
  }

  // Contact impulse along the stick axis: Δv = J/m
  const mass = Math.max(0.5, boatStats.mass);
  const J = TUNABLES.pokeImpulse * stick.power;
  boat.vx += (pushX * J) / mass;
  boat.vy += (pushY * J) / mass;

  // Lever yaw in Y-up XZ: τ_y = r_z F_x - r_x F_z so the poked side moves with the shove.
  // Softness scales how sharply the hull yaws; hold weathercock so it can’t reverse it.
  const lever = oy * pushX - ox * pushY;
  const yawKick = lever * TUNABLES.pokeYawKick * stick.softness;
  boat.angle += yawKick;
  boat.omega = (boat.omega || 0) + yawKick * 0.35;
  if (boat.omega > TUNABLES.maxOmega) boat.omega = TUNABLES.maxOmega;
  if (boat.omega < -TUNABLES.maxOmega) boat.omega = -TUNABLES.maxOmega;
  boat.pokeYawHold = TUNABLES.pokeYawHold;

  io.emit('boatPoked', { id: playerId, hitX: aimX, hitY: aimY });
  return true;
}

/** Throw a string and reel the boat back toward the sailor on the rim. */
function applyBoatLasso(playerId) {
  const player = players[playerId];
  if (!player || !player.isPlaying || !player.boat || player.boat.isSunk) return false;
  if (player.lassoCooldown && player.lassoCooldown > 0) return false;

  const boat = player.boat;
  const px = Math.cos(player.playerAngle) * INNER_PATH_RADIUS;
  const py = Math.sin(player.playerAngle) * INNER_PATH_RADIUS;
  const dist = Math.hypot(boat.x - px, boat.y - py);
  if (dist > LASSO_RANGE) return false;
  // Already at their feet — nothing to reel
  if (dist < BOAT_RADIUS + 2) return false;

  player.lasso = { t: LASSO_DURATION };
  player.lassoCooldown = LASSO_COOLDOWN;
  io.emit('boatLassoed', { id: playerId });
  return true;
}

function updateLassoPull(player, dt) {
  if (player.lassoCooldown > 0) {
    player.lassoCooldown = Math.max(0, player.lassoCooldown - dt);
  }
  if (!player.lasso || !player.boat || player.boat.isSunk) {
    player.lasso = null;
    return;
  }

  const boat = player.boat;
  player.lasso.t -= dt;
  const px = Math.cos(player.playerAngle) * INNER_PATH_RADIUS;
  const py = Math.sin(player.playerAngle) * INNER_PATH_RADIUS;
  let dx = px - boat.x;
  let dy = py - boat.y;
  const dist = Math.hypot(dx, dy) || 1;
  dx /= dist;
  dy /= dist;

  const boatStats = getBoatStats(boat);
  const pull = (LASSO_PULL / Math.max(0.5, boatStats.mass)) * dt;
  boat.vx += dx * pull;
  boat.vy += dy * pull;

  // Ease yaw toward the pull so the stern faces the sailor
  const pullAngle = Math.atan2(dy, dx);
  let angleDiff = pullAngle - boat.angle;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  boat.angle += angleDiff * 0.12;

  // Stop reeling when close to the rim or timer ends
  if (player.lasso.t <= 0 || dist < FOUNTAIN_RADIUS - BOAT_RADIUS - 1.5) {
    player.lasso = null;
  }
}

function updateComputerPlayers(dt) {
  for (const id in players) {
    const player = players[id];
    if (!player?.isBot || !player.isPlaying) continue;

    const ai = player.bot;
    if (!ai) continue;

    // Respawn sunk bot boats after a short wait
    if (player.boat?.isSunk) {
      if (ai.respawnTimer <= 0) ai.respawnTimer = 4 + Math.random() * 4;
      ai.respawnTimer -= dt;
      if (ai.respawnTimer <= 0) {
        const custom = player.boat.customization;
        const keptScore = player.boat.score || 0;
        player.boat = createBoatAtAngle(player.playerAngle, custom, keptScore);
        io.emit('boatRespawned', { id, boat: player.boat });
        ai.pokeTimer = 1 + Math.random() * 2;
      }
      continue;
    }

    ai.dirTimer -= dt;
    if (ai.dirTimer <= 0) {
      const roll = Math.random();
      if (roll < 0.15) ai.dir = 0;
      else ai.dir = roll < 0.575 ? -1 : 1;
      ai.dirTimer = 1.5 + Math.random() * 4;
    }

    if (ai.dir !== 0) {
      player.playerAngle += ai.dir * BOT_WALK_SPEED * dt;
      while (player.playerAngle < 0) player.playerAngle += Math.PI * 2;
      while (player.playerAngle >= Math.PI * 2) player.playerAngle -= Math.PI * 2;
    }

    ai.pokeTimer -= dt;
    if (ai.pokeTimer <= 0 && player.boat) {
      ai.pokeTimer = 2.5 + Math.random() * 5;
      // Poke a random point on the hull
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * (BOAT_HIT_RADIUS * 0.7);
      const hitX = player.boat.x + Math.cos(ang) * rad;
      const hitY = player.boat.y + Math.sin(ang) * rad;
      applyBoatPoke(id, hitX, hitY);
    }

  }
}

// Update wind state smoothly
function updateWind(dt) {
  if (TUNABLES.windAuto) {
    wind.changeTimer -= dt;
    if (wind.changeTimer <= 0) {
      wind.targetAngle = Math.random() * Math.PI * 2;
      wind.targetSpeed = 2 + Math.random() * 10; // Speed between 2 and 12
      const span = Math.max(0, TUNABLES.windChangeMax - TUNABLES.windChangeMin);
      wind.changeTimer = TUNABLES.windChangeMin + Math.random() * span;
    }
  }

  // Interpolate angle (taking shortest path)
  let angleDiff = wind.targetAngle - wind.angle;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  wind.angle += angleDiff * dt * 0.2;

  // Interpolate speed
  wind.speed += (wind.targetSpeed - wind.speed) * dt * 0.2;
}

function clampBoatSpeed(boat) {
  const maxSpeed = getBoatStats(boat).maxSpeed || MAX_BOAT_SPEED;
  const speed = Math.hypot(boat.vx, boat.vy);
  if (speed > maxSpeed) {
    const s = maxSpeed / speed;
    boat.vx *= s;
    boat.vy *= s;
  }
}

function applyCollisionDamage(boat, amount) {
  const durability = Math.max(0.35, getBoatStats(boat).durability);
  boat.damage = Math.max(0, boat.damage - amount / durability);
  if (boat.damage <= 0) boat.isSunk = true;
}

/** Push circle A out of circle B; bounce A if moving into B. Returns approach speed. */
function separateFromCircle(boat, cx, cy, solidRadius, bounce = BOUNCE) {
  let dx = boat.x - cx;
  let dy = boat.y - cy;
  let dist = Math.hypot(dx, dy);
  const minDist = solidRadius + BOAT_RADIUS;

  if (dist < 1e-6) {
    // Exact center overlap — pick a stable outward axis
    dx = 1;
    dy = 0;
    dist = 1e-6;
  }

  if (dist >= minDist) return 0;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;
  boat.x += nx * overlap;
  boat.y += ny * overlap;

  const impact = boat.vx * nx + boat.vy * ny;
  if (impact < 0) {
    boat.vx -= (1 + bounce) * impact * nx;
    boat.vy -= (1 + bounce) * impact * ny;
  }
  return -Math.min(0, impact);
}

function resolveStaticCollisions(boat, id) {
  // Outer rim — keep boats inside the fountain
  let distFromCenter = Math.hypot(boat.x, boat.y);
  if (distFromCenter < 1e-6) {
    boat.x = 0.01;
    distFromCenter = 0.01;
  }
  const maxDist = FOUNTAIN_RADIUS - BOAT_RADIUS;
  if (distFromCenter > maxDist) {
    const nx = boat.x / distFromCenter;
    const ny = boat.y / distFromCenter;
    const overlap = distFromCenter - maxDist;
    boat.x -= nx * overlap;
    boat.y -= ny * overlap;

    const impact = boat.vx * nx + boat.vy * ny;
    if (impact > 0) {
      boat.vx -= (1 + BOUNCE) * impact * nx;
      boat.vy -= (1 + BOUNCE) * impact * ny;
      if (impact > 0.5) applyCollisionDamage(boat, impact * 5);
    }
  }

  // Center fountain pedestal
  const centerImpact = separateFromCircle(boat, 0, 0, CENTER_FOUNTAIN_RADIUS);
  if (centerImpact > 0.35) applyCollisionDamage(boat, centerImpact * 4);

  // Rocks / buoys / pads (rings are pass-through scoring gates)
  for (const obs of obstacles) {
    if (obs.type === 'ring') continue;
    const impact = separateFromCircle(boat, obs.x, obs.y, obs.radius);
    if (impact > 0.2) {
      applyCollisionDamage(boat, COLLISION_DAMAGE * Math.min(1, impact));
      io.to(id).emit('collision', { obstacleId: obs.id, newDamage: boat.damage });
    }
  }
}

function resolveBoatBoatCollisions(active) {
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i].boat;
      const b = active[j].boat;
      if (a.isSunk || b.isSunk) continue;

      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      const minDist = BOAT_RADIUS * 2;

      if (dist < 1e-6) {
        dx = 1;
        dy = 0;
        dist = 1e-6;
      }
      if (dist >= minDist) continue;

      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      // Split separation so neither boat tunnels into the other
      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;

      const rvx = a.vx - b.vx;
      const rvy = a.vy - b.vy;
      const velAlong = rvx * nx + rvy * ny;
      if (velAlong > 0) continue; // already separating

      const impulse = -(1 + BOUNCE) * velAlong * 0.5;
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
    }
  }
}

// Main physics loop (30 times per second)
const TICK_RATE = 30;
const DT = 1 / TICK_RATE;

setInterval(() => {
  updateWind(DT);
  updateComputerPlayers(DT);

  const active = [];
  const updatedBoats = [];
  const avatarAngles = [];

  for (const id in players) {
    const player = players[id];
    if (!player.isPlaying || !player.boat) continue;

    const boat = player.boat;
    if (boat.isSunk) {
      player.lasso = null;
      if (player.lassoCooldown > 0) {
        player.lassoCooldown = Math.max(0, player.lassoCooldown - DT);
      }
      if (boat.ringStreak) boat.ringStreak = 0;
      updatedBoats.push({
        id,
        x: boat.x,
        y: boat.y,
        vx: 0,
        vy: 0,
        angle: boat.angle,
        isSunk: true,
        damage: 0,
        score: boat.score || 0,
        ringStreak: 0,
      });
      continue;
    }

    updateLassoPull(player, DT);

    const stats = getBoatStats(boat);

    // Apply linear drag (higher drag value = more friction retained… we use per-boat drag)
    boat.vx *= stats.drag;
    boat.vy *= stats.drag;
    boat.omega = (boat.omega || 0) * TUNABLES.angularDrag;

    const boatHeadingX = Math.cos(boat.angle);
    const boatHeadingY = Math.sin(boat.angle);
    // Wind angle = direction the breeze blows toward (matches vane after CSS fix).
    const windDirX = Math.cos(wind.angle);
    const windDirY = Math.sin(wind.angle);
    // +1 running with the wind, 0 beam reach, -1 head-to-wind
    const pointOfSail = boatHeadingX * windDirX + boatHeadingY * windDirY;

    // Faint sail drive along the bow — subtle downwind bias, barely a brake in irons.
    const drive = Math.max(-0.15, 0.25 + 0.75 * pointOfSail);
    const sailAccel = wind.speed * TUNABLES.sailAccel * drive * stats.windCatch;
    boat.vx += boatHeadingX * sailAccel;
    boat.vy += boatHeadingY * sailAccel;

    // Soft leeway so the breeze is noticeable over time, not a shove
    const leeway = wind.speed * TUNABLES.leeway * stats.windCatch;
    boat.vx += windDirX * leeway;
    boat.vy += windDirY * leeway;
    clampBoatSpeed(boat);

    boat.prevX = boat.x;
    boat.prevY = boat.y;
    boat.x += boat.vx;
    boat.y += boat.vy;

    // Residual poke spin
    boat.angle += boat.omega || 0;

    // Weathercock toward velocity — off after poke; weak on sideslip so shoves don’t snap heading
    if (boat.pokeYawHold > 0) {
      boat.pokeYawHold = Math.max(0, boat.pokeYawHold - DT);
    }
    const currentSpeedSq = boat.vx * boat.vx + boat.vy * boat.vy;
    const hold = boat.pokeYawHold || 0;
    if (hold <= 0 && currentSpeedSq > 0.01) {
      const targetAngle = Math.atan2(boat.vy, boat.vx);
      let angleDiff = targetAngle - boat.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      // Prefer tracking when already aligned; still ease into wind drift so direction matters
      const align = Math.max(0, Math.cos(angleDiff));
      const weathercock = stats.turnRate * (0.28 + 0.72 * align);
      let step = angleDiff * weathercock;
      if (step > TUNABLES.weathercockMaxStep) step = TUNABLES.weathercockMaxStep;
      if (step < -TUNABLES.weathercockMaxStep) step = -TUNABLES.weathercockMaxStep;
      boat.angle += step;
    }

    active.push({ id, boat });
  }

  // Multi-pass so resolving one contact can't leave boats inside another solid
  for (let iter = 0; iter < COLLISION_ITERS; iter++) {
    for (const { id, boat } of active) {
      if (!boat.isSunk) resolveStaticCollisions(boat, id);
    }
    resolveBoatBoatCollisions(active);
  }
  // Final static pass — boat–boat can shove hulls back into the centerpiece/rim
  for (const { id, boat } of active) {
    if (!boat.isSunk) resolveStaticCollisions(boat, id);
  }

  for (const { id, boat } of active) {
    clampBoatSpeed(boat);
    checkRingClears(boat, id);
    updatedBoats.push({
      id,
      x: boat.x,
      y: boat.y,
      vx: boat.vx,
      vy: boat.vy,
      angle: boat.angle,
      damage: boat.damage,
      isSunk: boat.isSunk,
      score: boat.score || 0,
      ringStreak: boat.ringStreak || 0,
    });
  }

  for (const id in players) {
    const p = players[id];
    if (p?.isPlaying) {
      avatarAngles.push({ id, angle: p.playerAngle });
    }
  }

  io.emit('stateUpdate', {
    boats: updatedBoats,
    avatars: avatarAngles,
    wind: {
      angle: wind.angle,
      speed: wind.speed
    }
  });
}, 1000 / TICK_RATE);

// WebSockets Communication
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create initial player data
  players[socket.id] = {
    id: socket.id,
    isPlaying: false,
    playerAngle: Math.random() * Math.PI * 2, // child's starting angle around fountain
    boat: null
  };

  // Send baseline data (static obstacles) to the new connection
  socket.emit('initGame', {
    obstacles,
    fountainRadius: FOUNTAIN_RADIUS
  });

  // Client joining the lobby / loading the level
  socket.on('joinGame', (data = {}) => {
    const player = players[socket.id];
    if (player) {
      player.isPlaying = true;
      player.isBot = false;

      // Prefer the client's rim angle so the boat is created beside their sailor
      if (typeof data.playerAngle === 'number' && Number.isFinite(data.playerAngle)) {
        let a = data.playerAngle;
        while (a < 0) a += Math.PI * 2;
        while (a >= Math.PI * 2) a -= Math.PI * 2;
        player.playerAngle = a;
      }

      player.boat = createBoatAtAngle(player.playerAngle, {
        playerName: sanitizePlayerName(data.playerName),
        characterType: data.characterType || 'boy',
        boatType: data.boatType || 'standard',
        boatColor: data.boatColor || '#ff9999',
        flagColor: data.flagColor || '#9999ff',
        flagSymbol: data.flagSymbol || 'star',
        stickColor: data.stickColor || '#d7a15c',
        stickType: data.stickType || 'wooden'
      });
      player.playerName = player.boat.customization.playerName;

      // First human into an empty park: roll 3–5 computer kids
      spawnComputerPlayers();

      // Catch the new client up on anyone already sailing (including bots)
      for (const otherId in players) {
        if (otherId === socket.id) continue;
        const other = players[otherId];
        if (!other?.isPlaying || !other.boat) continue;
        socket.emit('playerJoined', {
          id: otherId,
          playerAngle: other.playerAngle,
          boat: other.boat
        });
      }

      // Broadcast new player registry to all clients
      io.emit('playerJoined', {
        id: socket.id,
        playerAngle: player.playerAngle,
        boat: player.boat
      });
    }
  });

  // Client updating their child avatar position on the path
  socket.on('movePlayer', (data) => {
    const player = players[socket.id];
    if (player && player.isPlaying) {
      player.playerAngle = data.angle;
      // Broadcast player avatar movement to everyone else
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        angle: player.playerAngle
      });
    }
  });

  // Client poking their boat — requires a hit on the boat (hitX/hitY in fountain 2D)
  socket.on('pokeBoat', (data = {}) => {
    if (typeof data.hitX !== 'number' || typeof data.hitY !== 'number') return;
    applyBoatPoke(socket.id, data.hitX, data.hitY);
  });

  // Client lassos their boat — reel it back toward the rim
  socket.on('lassoBoat', () => {
    applyBoatLasso(socket.id);
  });

  // Client requesting a respawn/repair of their boat
  socket.on('respawnBoat', () => {
    const player = players[socket.id];
    if (player && player.isPlaying && player.boat) {
      const spawn = boatSpawnBesidePlayer(player.playerAngle);
      player.boat.x = spawn.x;
      player.boat.y = spawn.y;
      player.boat.vx = 0;
      player.boat.vy = 0;
      player.boat.omega = 0;
      player.boat.pokeYawHold = 0;
      player.boat.angle = spawn.angle;
      player.boat.damage = 100;
      player.boat.isSunk = false;
      player.boat.ringStreak = 0;
      player.boat.ringCooldowns = {};
      player.boat.prevX = spawn.x;
      player.boat.prevY = spawn.y;

      io.emit('boatRespawned', {
        id: socket.id,
        boat: player.boat
      });
    }
  });

  // Client returning to the setup menu (restart / leave session)
  socket.on('leaveGame', () => {
    const player = players[socket.id];
    if (!player || !player.isPlaying) return;
    const wasHuman = !player.isBot;
    player.isPlaying = false;
    player.boat = null;
    io.emit('playerLeft', { id: socket.id });
    if (wasHuman && !hasHumanPlayers()) {
      clearComputerPlayers();
    }
  });

  // Dev Mode (~): live weather / env / boat / stick tweaks
  socket.on('devGetSettings', () => {
    socket.emit('devSettings', getDevSettings());
  });

  socket.on('devSetSettings', (data = {}) => {
    const next = applyDevSettings(data);
    io.emit('devSettings', next);
  });

  socket.on('devResetSettings', () => {
    const next = resetDevSettings();
    io.emit('devSettings', next);
  });

  // Client disconnecting
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const leaving = players[socket.id];
    const wasHuman = leaving && !leaving.isBot;
    delete players[socket.id];
    io.emit('playerLeft', { id: socket.id });

    // Park empties when the last human leaves — clear bots for a fresh roll next sail
    if (wasHuman && !hasHumanPlayers()) {
      clearComputerPlayers();
    }
  });
});

const PORT = process.env.PORT || 3005;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
