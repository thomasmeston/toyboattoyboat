import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/health', (req, res) => {
  res.send({ status: 'ok' });
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
const INNER_PATH_RADIUS = 102; // Path where children walk
const POKE_RANGE = 20; // Length of the pushstick
const PUSH_FORCE = 15;
const DRAG = 0.96; // Water friction coefficient
const COLLISION_DAMAGE = 15;

// Game State
const players = {};
const obstacles = [];
let wind = {
  angle: 0,
  speed: 5,
  targetAngle: 0,
  targetSpeed: 5,
  changeTimer: 0
};

// Generate static obstacles in the fountain
function generateObstacles() {
  const count = 12;
  const types = ['rock', 'buoy', 'leaf', 'lilypad'];
  for (let i = 0; i < count; i++) {
    // Distribute obstacles at various distances from center (between 15 and 85 units)
    const distance = 20 + Math.random() * 65;
    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const type = types[Math.floor(Math.random() * types.length)];
    let radius = 3;
    if (type === 'rock') radius = 5 + Math.random() * 3;
    else if (type === 'buoy') radius = 2;
    else if (type === 'leaf') radius = 4;
    else if (type === 'lilypad') radius = 3;

    obstacles.push({
      id: `obs_${i}`,
      x,
      y,
      radius,
      type
    });
  }
}
generateObstacles();

// Update wind state smoothly
function updateWind(dt) {
  wind.changeTimer -= dt;
  if (wind.changeTimer <= 0) {
    // Set new wind target
    wind.targetAngle = Math.random() * Math.PI * 2;
    wind.targetSpeed = 2 + Math.random() * 10; // Speed between 2 and 12
    wind.changeTimer = 10 + Math.random() * 15; // Change every 10 to 25 seconds
  }

  // Interpolate angle (taking shortest path)
  let angleDiff = wind.targetAngle - wind.angle;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  wind.angle += angleDiff * dt * 0.2;

  // Interpolate speed
  wind.speed += (wind.targetSpeed - wind.speed) * dt * 0.2;
}

// Main physics loop (30 times per second)
const TICK_RATE = 30;
const DT = 1 / TICK_RATE;

setInterval(() => {
  updateWind(DT);

  const updatedBoats = [];

  for (const id in players) {
    const player = players[id];
    if (!player.isPlaying) continue;

    const boat = player.boat;
    if (!boat) continue;

    if (boat.isSunk) {
      // Boat is sinking/sunk, slowly sink or do nothing
      updatedBoats.push({
        id,
        x: boat.x,
        y: boat.y,
        vx: 0,
        vy: 0,
        angle: boat.angle,
        isSunk: true,
        damage: 0
      });
      continue;
    }

    // Apply linear drag
    boat.vx *= DRAG;
    boat.vy *= DRAG;

    // Calculate wind influence on sails (Automatic sail trimming)
    // Project wind force onto boat's heading
    const boatHeadingX = Math.cos(boat.angle);
    const boatHeadingY = Math.sin(boat.angle);
    const windForceX = Math.cos(wind.angle) * wind.speed;
    const windForceY = Math.sin(wind.angle) * wind.speed;

    // Dot product of wind vector and boat heading vector
    const windDotHeading = windForceX * boatHeadingX + windForceY * boatHeadingY;

    // Boat can sail with the wind. If sailing against the wind, speed decreases significantly
    let windThrust = 0;
    if (windDotHeading > -wind.speed * 0.4) {
      // Sailing with or across the wind
      windThrust = (windDotHeading + wind.speed * 0.4) * 0.05;
    } else {
      // Direct headwind resistance
      windThrust = windDotHeading * 0.02; 
    }

    boat.vx += boatHeadingX * windThrust * DT;
    boat.vy += boatHeadingY * windThrust * DT;

    // Update position
    boat.x += boat.vx;
    boat.y += boat.vy;

    // Update boat heading to align slowly with movement direction (only if moving)
    const currentSpeedSq = boat.vx * boat.vx + boat.vy * boat.vy;
    if (currentSpeedSq > 0.01) {
      const targetAngle = Math.atan2(boat.vy, boat.vx);
      let angleDiff = targetAngle - boat.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      boat.angle += angleDiff * 0.1;
    }

    // --- COLLISION RESOLUTION ---
    
    // 1. Outer Fountain Wall Boundary (bouncing inside)
    const distFromCenter = Math.sqrt(boat.x * boat.x + boat.y * boat.y);
    const boatRadius = 2.0; // simplified boat boundary
    if (distFromCenter + boatRadius > FOUNTAIN_RADIUS) {
      // Push back inside
      const overlap = (distFromCenter + boatRadius) - FOUNTAIN_RADIUS;
      const normalX = boat.x / distFromCenter;
      const normalY = boat.y / distFromCenter;
      
      boat.x -= normalX * overlap;
      
      // Bounce reflection (elasticity 0.5)
      const dotProduct = boat.vx * normalX + boat.vy * normalY;
      boat.vx = (boat.vx - 2 * dotProduct * normalX) * 0.5;
      boat.vy = (boat.vy - 2 * dotProduct * normalY) * 0.5;
      
      // Damage slightly from boundary impact if speed is high
      const impactSpeed = Math.abs(dotProduct);
      if (impactSpeed > 0.5) {
        boat.damage = Math.max(0, boat.damage - impactSpeed * 5);
        if (boat.damage <= 0) boat.isSunk = true;
      }
    }

    // 2. Obstacles Collisions
    for (const obs of obstacles) {
      const dx = boat.x - obs.x;
      const dy = boat.y - obs.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = obs.radius + boatRadius;
      if (dist < minDist) {
        // Resolve overlap
        const overlap = minDist - dist;
        const normalX = dx / dist;
        const normalY = dy / dist;

        boat.x += normalX * overlap;
        boat.y += normalY * overlap;

        // Bounce response
        const dotProduct = boat.vx * normalX + boat.vy * normalY;
        boat.vx = (boat.vx - 2 * dotProduct * normalX) * 0.5;
        boat.vy = (boat.vy - 2 * dotProduct * normalY) * 0.5;

        // Apply obstacle damage
        boat.damage = Math.max(0, boat.damage - COLLISION_DAMAGE);
        if (boat.damage <= 0) {
          boat.isSunk = true;
        }

        // Notify client of collision impact
        io.to(id).emit('collision', { obstacleId: obs.id, newDamage: boat.damage });
      }
    }

    updatedBoats.push({
      id,
      x: boat.x,
      y: boat.y,
      vx: boat.vx,
      vy: boat.vy,
      angle: boat.angle,
      damage: boat.damage,
      isSunk: boat.isSunk
    });
  }

  // Broadcast all boat updates and wind to all connected clients
  io.emit('stateUpdate', {
    boats: updatedBoats,
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

  // Client joining the lobby
  socket.on('joinGame', (data) => {
    const player = players[socket.id];
    if (player) {
      player.isPlaying = true;
      // Initialize boat near the player's walking position on the rim
      const spawnDist = FOUNTAIN_RADIUS - 5; // Spawn just inside the edge
      const spawnX = Math.cos(player.playerAngle) * spawnDist;
      const spawnY = Math.sin(player.playerAngle) * spawnDist;

      player.boat = {
        x: spawnX,
        y: spawnY,
        vx: 0,
        vy: 0,
        angle: player.playerAngle + Math.PI, // Face inwards towards fountain center
        damage: 100,
        isSunk: false,
        customization: {
          boatType: data.boatType || 'standard',
          boatColor: data.boatColor || '#ff9999',
          flagColor: data.flagColor || '#9999ff',
          flagSymbol: data.flagSymbol || 'star',
          stickColor: data.stickColor || '#d7a15c',
          stickType: data.stickType || 'wooden'
        }
      };

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

  // Client poking their boat with a pushstick
  socket.on('pokeBoat', () => {
    const player = players[socket.id];
    if (!player || !player.isPlaying || !player.boat || player.boat.isSunk) return;

    const boat = player.boat;
    
    // Calculate player's position in 2D space on the path
    const px = Math.cos(player.playerAngle) * INNER_PATH_RADIUS;
    const py = Math.sin(player.playerAngle) * INNER_PATH_RADIUS;

    // Check distance between player avatar and boat
    const dx = boat.x - px;
    const dy = boat.y - py;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= POKE_RANGE) {
      // Push direction: from player to boat
      const pushX = dx / dist;
      const pushY = dy / dist;

      // Apply linear impulse
      boat.vx += pushX * PUSH_FORCE * DT;
      boat.vy += pushY * PUSH_FORCE * DT;

      // Instantly set boat heading to face away from the player to align with the push direction
      boat.angle = Math.atan2(pushY, pushX);

      // Broadcast poke action for animation/sfx purposes
      io.emit('boatPoked', { id: socket.id });
    }
  });

  // Client requesting a respawn/repair of their boat
  socket.on('respawnBoat', () => {
    const player = players[socket.id];
    if (player && player.isPlaying && player.boat) {
      const spawnDist = FOUNTAIN_RADIUS - 5;
      const spawnX = Math.cos(player.playerAngle) * spawnDist;
      const spawnY = Math.sin(player.playerAngle) * spawnDist;

      player.boat.x = spawnX;
      player.boat.y = spawnY;
      player.boat.vx = 0;
      player.boat.vy = 0;
      player.boat.angle = player.playerAngle + Math.PI;
      player.boat.damage = 100;
      player.boat.isSunk = false;

      io.emit('boatRespawned', {
        id: socket.id,
        boat: player.boat
      });
    }
  });

  // Client disconnecting
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', { id: socket.id });
  });
});

const PORT = process.env.PORT || 3005;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
