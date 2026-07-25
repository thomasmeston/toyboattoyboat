// Browser-safe fountain gameplay simulation shared by Socket.IO and offline solo.
// onEmit(event, payload, toPlayerId): omitted toPlayerId broadcasts to every client.
export function createFountainSim({ onEmit = () => {} } = {}) {
  const FOUNTAIN_RADIUS = 100;
  const INNER_PATH_RADIUS = 104.5;
  const CENTER_FOUNTAIN_RADIUS = 20;
  const POKE_RANGE = FOUNTAIN_RADIUS;
  const LASSO_RANGE = FOUNTAIN_RADIUS;
  const LASSO_PULL = 22;
  const LASSO_DURATION = 0.9;
  const LASSO_COOLDOWN = 1.6;
  const DRAG = 0.96;
  const COLLISION_DAMAGE = 15;
  const BOAT_HIT_RADIUS = 5;
  const BOAT_RADIUS = 3.6;
  const MAX_BOAT_SPEED = 2.8;
  const COLLISION_ITERS = 4;
  const BOUNCE = 0.55;
  const BOT_WALK_SPEED = 0.28;
  const TICK_RATE = 30;
  const DT = 1 / TICK_RATE;
  const RING_CLEAR_POINTS = 5;
  const RING_STREAK_BONUS = 20;
  const RING_STREAK_TARGET = 3;
  const BOT_TYPES = ['standard', 'cutter', 'pirate'];
  const BOT_CHARS = ['boy', 'girl'];
  const BOT_SYMBOLS = ['star', 'heart', 'anchor', 'moon'];
  const BOT_STICKS = ['wooden', 'brass', 'ribbon'];
  const BOT_FIRST = [
    'Lucie', 'Pierre', 'Camille', 'Hugo', 'Léa', 'Louis', 'Chloé', 'Gabriel',
    'Manon', 'Jules', 'Inès', 'Arthur', 'Nina', 'Raphaël', 'Zoé', 'Paul',
  ];
  const BOT_LAST = [
    'Petit', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Lefevre', 'Roux',
    'Fournier', 'Girard', 'Bonnet', 'Dupont', 'Lambert',
  ];

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
  const BOAT_STATS = {
    standard: {
      maxSpeed: 2.8, drag: 0.96, windCatch: 1.0, mass: 1.0,
      durability: 1.0, turnRate: 0.1,
    },
    cutter: {
      maxSpeed: 3.45, drag: 0.968, windCatch: 1.3, mass: 0.82,
      durability: 0.72, turnRate: 0.145,
    },
    pirate: {
      maxSpeed: 2.15, drag: 0.948, windCatch: 0.75, mass: 1.4,
      durability: 1.45, turnRate: 0.065,
    },
  };
  const STICK_STATS = {
    wooden: { power: 1.0, accuracy: 1.0, softness: 1.0 },
    brass: { power: 1.5, accuracy: 0.65, softness: 1.35 },
    ribbon: { power: 0.68, accuracy: 1.45, softness: 0.5 },
  };
  const TUNABLES_DEFAULTS = structuredCloneSafe(TUNABLES);
  const BOAT_STATS_DEFAULTS = structuredCloneSafe(BOAT_STATS);
  const STICK_STATS_DEFAULTS = structuredCloneSafe(STICK_STATS);

  const players = {};
  const connectedIds = new Set();
  const obstacles = [];
  let botSerial = 0;
  let connectionSerial = 0;
  let timer = null;
  let wind = {
    angle: 0,
    speed: 5,
    targetAngle: 0,
    targetSpeed: 5,
    changeTimer: 0,
  };

  function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emit(event, payload, toPlayerId) {
    onEmit(event, payload, toPlayerId);
  }

  function emitOthers(exceptId, event, payload) {
    for (const id of connectedIds) {
      if (id !== exceptId) emit(event, payload, id);
    }
  }

  function placementClearOf(existing, x, y, minDist) {
    return existing.every((o) => Math.hypot(x - o.x, y - o.y) >= minDist);
  }

  function generateObstacles() {
    for (let i = 0; i < 12; i++) {
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
      obstacles.push({ id: `obs_${i}`, x, y, radius, type });
    }

    for (let i = 0; i < 6; i++) {
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

  function getBoatStats(boat) {
    return BOAT_STATS[boat?.customization?.boatType || 'standard'] || BOAT_STATS.standard;
  }

  function getStickStats(boat) {
    return STICK_STATS[boat?.customization?.stickType || 'wooden'] || STICK_STATS.wooden;
  }

  function boatSpawnBesidePlayer(playerAngle) {
    const spawnDist = FOUNTAIN_RADIUS - BOAT_RADIUS - 0.15;
    return {
      x: Math.cos(playerAngle) * spawnDist,
      y: Math.sin(playerAngle) * spawnDist,
      angle: playerAngle + Math.PI,
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
      omega: 0,
      pokeYawHold: 0,
      angle: spawn.angle,
      damage: 100,
      isSunk: false,
      score: scoreCarry,
      ringStreak: 0,
      ringCooldowns: {},
      customization,
    };
  }

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
      emit('ringCleared', {
        obstacleId: obs.id,
        points: RING_CLEAR_POINTS,
        bonus,
        score: boat.score,
        ringStreak: boat.ringStreak,
      }, playerId);
    }
  }

  function spawnComputerPlayers() {
    if (countBots() > 0) return;
    const count = 3 + Math.floor(Math.random() * 3);
    const usedNames = new Set();
    for (const p of Object.values(players)) {
      const name = p?.boat?.customization?.playerName;
      if (name) usedNames.add(name);
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
  }

  function clearComputerPlayers() {
    const botIds = Object.keys(players).filter((id) => players[id]?.isBot);
    for (const id of botIds) {
      delete players[id];
      emit('playerLeft', { id });
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
    if (Math.hypot(toBoatX, toBoatY) > POKE_RANGE) return false;

    const accuracy = Math.max(0.35, stick.accuracy);
    const centerPull = Math.max(0, 1.15 - accuracy);
    const aimX = hitX + (boat.x - hitX) * centerPull;
    const aimY = hitY + (boat.y - hitY) * centerPull;
    const ox = aimX - boat.x;
    const oy = aimY - boat.y;
    if (Math.hypot(ox, oy) > BOAT_HIT_RADIUS) return false;

    let dx = aimX - px;
    let dy = aimY - py;
    let dist = Math.hypot(dx, dy);
    if (dist < 0.001) {
      dx = toBoatX || Math.cos(player.playerAngle + Math.PI);
      dy = toBoatY || Math.sin(player.playerAngle + Math.PI);
      dist = Math.hypot(dx, dy) || 1;
    }
    let pushX = dx / dist;
    let pushY = dy / dist;
    if (accuracy < 1) {
      const sprayAngle = (Math.random() - 0.5) * (1 - accuracy) * 0.55;
      const cos = Math.cos(sprayAngle);
      const sin = Math.sin(sprayAngle);
      const rx = pushX * cos - pushY * sin;
      const ry = pushX * sin + pushY * cos;
      pushX = rx;
      pushY = ry;
    }

    const mass = Math.max(0.5, boatStats.mass);
    const impulse = TUNABLES.pokeImpulse * stick.power;
    boat.vx += (pushX * impulse) / mass;
    boat.vy += (pushY * impulse) / mass;
    const lever = oy * pushX - ox * pushY;
    const yawKick = lever * TUNABLES.pokeYawKick * stick.softness;
    boat.angle += yawKick;
    boat.omega = (boat.omega || 0) + yawKick * 0.35;
    boat.omega = Math.max(-TUNABLES.maxOmega, Math.min(TUNABLES.maxOmega, boat.omega));
    boat.pokeYawHold = TUNABLES.pokeYawHold;
    emit('boatPoked', { id: playerId, hitX: aimX, hitY: aimY });
    return true;
  }

  function applyBoatLasso(playerId) {
    const player = players[playerId];
    if (!player || !player.isPlaying || !player.boat || player.boat.isSunk) return false;
    if (player.lassoCooldown > 0) return false;
    const boat = player.boat;
    const px = Math.cos(player.playerAngle) * INNER_PATH_RADIUS;
    const py = Math.sin(player.playerAngle) * INNER_PATH_RADIUS;
    const dist = Math.hypot(boat.x - px, boat.y - py);
    if (dist > LASSO_RANGE || dist < BOAT_RADIUS + 2) return false;
    player.lasso = { t: LASSO_DURATION };
    player.lassoCooldown = LASSO_COOLDOWN;
    emit('boatLassoed', { id: playerId });
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
    const pull = (LASSO_PULL / Math.max(0.5, getBoatStats(boat).mass)) * dt;
    boat.vx += dx * pull;
    boat.vy += dy * pull;
    const pullAngle = Math.atan2(dy, dx);
    let angleDiff = pullAngle - boat.angle;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    boat.angle += angleDiff * 0.12;
    if (player.lasso.t <= 0 || dist < FOUNTAIN_RADIUS - BOAT_RADIUS - 1.5) {
      player.lasso = null;
    }
  }

  function updateComputerPlayers(dt) {
    for (const id in players) {
      const player = players[id];
      if (!player?.isBot || !player.isPlaying || !player.bot) continue;
      const ai = player.bot;
      if (player.boat?.isSunk) {
        if (ai.respawnTimer <= 0) ai.respawnTimer = 4 + Math.random() * 4;
        ai.respawnTimer -= dt;
        if (ai.respawnTimer <= 0) {
          const customization = player.boat.customization;
          const keptScore = player.boat.score || 0;
          player.boat = createBoatAtAngle(player.playerAngle, customization, keptScore);
          emit('boatRespawned', { id, boat: player.boat });
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
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * (BOAT_HIT_RADIUS * 0.7);
        applyBoatPoke(
          id,
          player.boat.x + Math.cos(angle) * radius,
          player.boat.y + Math.sin(angle) * radius,
        );
      }
    }
  }

  function updateWind(dt) {
    if (TUNABLES.windAuto) {
      wind.changeTimer -= dt;
      if (wind.changeTimer <= 0) {
        wind.targetAngle = Math.random() * Math.PI * 2;
        wind.targetSpeed = 2 + Math.random() * 10;
        const span = Math.max(0, TUNABLES.windChangeMax - TUNABLES.windChangeMin);
        wind.changeTimer = TUNABLES.windChangeMin + Math.random() * span;
      }
    }
    let angleDiff = wind.targetAngle - wind.angle;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    wind.angle += angleDiff * dt * 0.2;
    wind.speed += (wind.targetSpeed - wind.speed) * dt * 0.2;
  }

  function clampBoatSpeed(boat) {
    const maxSpeed = getBoatStats(boat).maxSpeed || MAX_BOAT_SPEED;
    const speed = Math.hypot(boat.vx, boat.vy);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      boat.vx *= scale;
      boat.vy *= scale;
    }
  }

  function applyCollisionDamage(boat, amount) {
    const durability = Math.max(0.35, getBoatStats(boat).durability);
    boat.damage = Math.max(0, boat.damage - amount / durability);
    if (boat.damage <= 0) boat.isSunk = true;
  }

  function separateFromCircle(boat, cx, cy, solidRadius, bounce = BOUNCE) {
    let dx = boat.x - cx;
    let dy = boat.y - cy;
    let dist = Math.hypot(dx, dy);
    const minDist = solidRadius + BOAT_RADIUS;
    if (dist < 1e-6) {
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
    const centerImpact = separateFromCircle(boat, 0, 0, CENTER_FOUNTAIN_RADIUS);
    if (centerImpact > 0.35) applyCollisionDamage(boat, centerImpact * 4);
    for (const obs of obstacles) {
      if (obs.type === 'ring') continue;
      const impact = separateFromCircle(boat, obs.x, obs.y, obs.radius);
      if (impact > 0.2) {
        applyCollisionDamage(boat, COLLISION_DAMAGE * Math.min(1, impact));
        emit('collision', { obstacleId: obs.id, newDamage: boat.damage }, id);
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
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;
        const velAlong = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (velAlong > 0) continue;
        const impulse = -(1 + BOUNCE) * velAlong * 0.5;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }
    }
  }

  function tick() {
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
      boat.vx *= stats.drag;
      boat.vy *= stats.drag;
      boat.omega = (boat.omega || 0) * TUNABLES.angularDrag;
      const boatHeadingX = Math.cos(boat.angle);
      const boatHeadingY = Math.sin(boat.angle);
      const windDirX = Math.cos(wind.angle);
      const windDirY = Math.sin(wind.angle);
      const pointOfSail = boatHeadingX * windDirX + boatHeadingY * windDirY;
      const drive = Math.max(-0.15, 0.25 + 0.75 * pointOfSail);
      const sailAccel = wind.speed * TUNABLES.sailAccel * drive * stats.windCatch;
      boat.vx += boatHeadingX * sailAccel;
      boat.vy += boatHeadingY * sailAccel;
      const leeway = wind.speed * TUNABLES.leeway * stats.windCatch;
      boat.vx += windDirX * leeway;
      boat.vy += windDirY * leeway;
      clampBoatSpeed(boat);
      boat.prevX = boat.x;
      boat.prevY = boat.y;
      boat.x += boat.vx;
      boat.y += boat.vy;
      boat.angle += boat.omega || 0;
      if (boat.pokeYawHold > 0) {
        boat.pokeYawHold = Math.max(0, boat.pokeYawHold - DT);
      }
      const currentSpeedSq = boat.vx * boat.vx + boat.vy * boat.vy;
      if ((boat.pokeYawHold || 0) <= 0 && currentSpeedSq > 0.01) {
        const targetAngle = Math.atan2(boat.vy, boat.vx);
        let angleDiff = targetAngle - boat.angle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        const align = Math.max(0, Math.cos(angleDiff));
        const weathercock = stats.turnRate * (0.28 + 0.72 * align);
        let step = angleDiff * weathercock;
        step = Math.max(-TUNABLES.weathercockMaxStep, Math.min(TUNABLES.weathercockMaxStep, step));
        boat.angle += step;
      }
      active.push({ id, boat });
    }

    for (let iter = 0; iter < COLLISION_ITERS; iter++) {
      for (const { id, boat } of active) {
        if (!boat.isSunk) resolveStaticCollisions(boat, id);
      }
      resolveBoatBoatCollisions(active);
    }
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
      const player = players[id];
      if (player?.isPlaying) avatarAngles.push({ id, angle: player.playerAngle });
    }
    emit('stateUpdate', {
      boats: updatedBoats,
      avatars: avatarAngles,
      wind: { angle: wind.angle, speed: wind.speed },
    });
  }

  function clampNum(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
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
      boats: structuredCloneSafe(BOAT_STATS),
      sticks: structuredCloneSafe(STICK_STATS),
    };
  }

  function applyDevSettings(data = {}) {
    const weather = data.weather;
    if (weather && typeof weather === 'object') {
      if (weather.angle != null) {
        wind.angle = clampNum(weather.angle, -Math.PI * 2, Math.PI * 2, wind.angle);
        wind.targetAngle = wind.angle;
      }
      if (weather.speed != null) {
        wind.speed = clampNum(weather.speed, 0, 30, wind.speed);
        wind.targetSpeed = wind.speed;
      }
      if (typeof weather.autoChange === 'boolean') TUNABLES.windAuto = weather.autoChange;
      if (weather.changeMinSec != null) {
        TUNABLES.windChangeMin = clampNum(weather.changeMinSec, 1, 120, TUNABLES.windChangeMin);
      }
      if (weather.changeMaxSec != null) {
        TUNABLES.windChangeMax = clampNum(weather.changeMaxSec, 1, 180, TUNABLES.windChangeMax);
      }
      if (TUNABLES.windChangeMax < TUNABLES.windChangeMin) {
        TUNABLES.windChangeMax = TUNABLES.windChangeMin;
      }
      if (weather.sailAccel != null) {
        TUNABLES.sailAccel = clampNum(weather.sailAccel, 0, 0.05, TUNABLES.sailAccel);
      }
      if (weather.leeway != null) {
        TUNABLES.leeway = clampNum(weather.leeway, 0, 0.05, TUNABLES.leeway);
      }
    }
    const environment = data.environment;
    if (environment && typeof environment === 'object') {
      const ranges = {
        pokeImpulse: [0, 5],
        pokeYawKick: [0, 2],
        angularDrag: [0.5, 0.999],
        maxOmega: [0, 1],
        pokeYawHold: [0, 5],
        weathercockMaxStep: [0, 0.5],
      };
      for (const [key, [min, max]] of Object.entries(ranges)) {
        if (environment[key] != null) {
          TUNABLES[key] = clampNum(environment[key], min, max, TUNABLES[key]);
        }
      }
    }
    const boatRanges = {
      maxSpeed: [0.2, 12],
      drag: [0.8, 0.999],
      windCatch: [0, 4],
      mass: [0.2, 5],
      durability: [0.2, 5],
      turnRate: [0, 1],
    };
    if (data.boats && typeof data.boats === 'object') {
      for (const type of Object.keys(BOAT_STATS)) {
        const source = data.boats[type];
        if (!source || typeof source !== 'object') continue;
        for (const [key, [min, max]] of Object.entries(boatRanges)) {
          if (source[key] != null) {
            BOAT_STATS[type][key] = clampNum(source[key], min, max, BOAT_STATS[type][key]);
          }
        }
      }
    }
    const stickRanges = { power: [0, 4], accuracy: [0.2, 3], softness: [0, 3] };
    if (data.sticks && typeof data.sticks === 'object') {
      for (const type of Object.keys(STICK_STATS)) {
        const source = data.sticks[type];
        if (!source || typeof source !== 'object') continue;
        for (const [key, [min, max]] of Object.entries(stickRanges)) {
          if (source[key] != null) {
            STICK_STATS[type][key] = clampNum(source[key], min, max, STICK_STATS[type][key]);
          }
        }
      }
    }
    return getDevSettings();
  }

  function resetDevSettings() {
    Object.assign(TUNABLES, structuredCloneSafe(TUNABLES_DEFAULTS));
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

  function connect(requestedId) {
    let id = requestedId;
    if (!id) {
      const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${connectionSerial++}`;
      id = `solo_${random}`;
    }
    connectedIds.add(id);
    players[id] = {
      id,
      isPlaying: false,
      playerAngle: Math.random() * Math.PI * 2,
      boat: null,
    };
    return id;
  }

  function disconnect(playerId) {
    if (!connectedIds.has(playerId) && !players[playerId]) return;
    connectedIds.delete(playerId);
    const leaving = players[playerId];
    const wasHuman = leaving && !leaving.isBot;
    delete players[playerId];
    emit('playerLeft', { id: playerId });
    if (wasHuman && !hasHumanPlayers()) clearComputerPlayers();
  }

  function handle(playerId, event, data = {}) {
    const player = players[playerId];
    if (!player) return;

    if (event === 'joinGame') {
      player.isPlaying = true;
      player.isBot = false;
      if (typeof data.playerAngle === 'number' && Number.isFinite(data.playerAngle)) {
        let angle = data.playerAngle;
        while (angle < 0) angle += Math.PI * 2;
        while (angle >= Math.PI * 2) angle -= Math.PI * 2;
        player.playerAngle = angle;
      }
      player.boat = createBoatAtAngle(player.playerAngle, {
        playerName: sanitizePlayerName(data.playerName),
        characterType: data.characterType || 'boy',
        boatType: data.boatType || 'standard',
        boatColor: data.boatColor || '#ff9999',
        flagColor: data.flagColor || '#9999ff',
        flagSymbol: data.flagSymbol || 'star',
        stickColor: data.stickColor || '#d7a15c',
        stickType: data.stickType || 'wooden',
      });
      player.playerName = player.boat.customization.playerName;
      spawnComputerPlayers();
      emit('initGame', { obstacles, fountainRadius: FOUNTAIN_RADIUS }, playerId);
      for (const otherId in players) {
        if (otherId === playerId) continue;
        const other = players[otherId];
        if (!other?.isPlaying || !other.boat) continue;
        emit('playerJoined', {
          id: otherId,
          playerAngle: other.playerAngle,
          boat: other.boat,
        }, playerId);
      }
      emit('playerJoined', {
        id: playerId,
        playerAngle: player.playerAngle,
        boat: player.boat,
      });
      return;
    }

    if (event === 'movePlayer') {
      if (player.isPlaying && typeof data.angle === 'number' && Number.isFinite(data.angle)) {
        player.playerAngle = data.angle;
        emitOthers(playerId, 'playerMoved', { id: playerId, angle: player.playerAngle });
      }
      return;
    }
    if (event === 'pokeBoat') {
      if (typeof data.hitX === 'number' && typeof data.hitY === 'number') {
        applyBoatPoke(playerId, data.hitX, data.hitY);
      }
      return;
    }
    if (event === 'lassoBoat') {
      applyBoatLasso(playerId);
      return;
    }
    if (event === 'respawnBoat') {
      if (!player.isPlaying || !player.boat) return;
      const spawn = boatSpawnBesidePlayer(player.playerAngle);
      Object.assign(player.boat, {
        x: spawn.x,
        y: spawn.y,
        prevX: spawn.x,
        prevY: spawn.y,
        vx: 0,
        vy: 0,
        omega: 0,
        pokeYawHold: 0,
        angle: spawn.angle,
        damage: 100,
        isSunk: false,
        ringStreak: 0,
        ringCooldowns: {},
      });
      emit('boatRespawned', { id: playerId, boat: player.boat });
      return;
    }
    if (event === 'leaveGame') {
      if (!player.isPlaying) return;
      const wasHuman = !player.isBot;
      player.isPlaying = false;
      player.boat = null;
      emit('playerLeft', { id: playerId });
      if (wasHuman && !hasHumanPlayers()) clearComputerPlayers();
      return;
    }
    if (event === 'devGetSettings') {
      emit('devSettings', getDevSettings(), playerId);
      return;
    }
    if (event === 'devSetSettings') {
      emit('devSettings', applyDevSettings(data));
      return;
    }
    if (event === 'devResetSettings') {
      emit('devSettings', resetDevSettings());
    }
  }

  function start() {
    if (timer != null) return;
    timer = setInterval(tick, 1000 / TICK_RATE);
  }

  function stop() {
    if (timer == null) return;
    clearInterval(timer);
    timer = null;
  }

  return {
    connect,
    disconnect,
    handle,
    start,
    stop,
    getDevSettings,
    applyDevSettings,
  };
}
