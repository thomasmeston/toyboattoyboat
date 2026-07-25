# ToyBoatToyBoat

Casual multiplayer toy sailboat game. Move your boat around fountains to pass through obstacles and gain points.

Built as an npm workspaces monorepo: **Vite + Three.js** client and **Express + Socket.IO** server.

## Requirements

- Node.js 18+ (20+ recommended)
- npm 9+

## Quick start

```bash
npm install
npm run dev
```

Then open **http://localhost:5181/**

| Process | Port | Role |
|---------|------|------|
| Client (Vite) | `5181` | Game UI |
| Server | `3005` | Physics, wind, multiplayer sync |

The client connects to `http://localhost:3005` when you run locally.

### Other scripts

```bash
npm run dev:client    # Vite only
npm run dev:server    # nodemon server only
npm run build:client  # production client build
```

## How to play

1. Pick solo or multiplayer, customize sailor / boat / stick / flag.
2. **Set Sail** — you spawn on the fountain rim with your boat in the water.
3. Guide the boat with stick pokes; wind and water drag do the rest.
4. Sail through the brass rings to score (streaks pay bonus).

### Controls

| Input | Action |
|-------|--------|
| **A** / **D** (or arrows) | Walk left / right on the rim |
| **Click** boat (or **Space** while aimed) | Stick poke |
| **E** | Lasso / reel boat toward you |
| **V** | Cycle camera (Follow Player → Follow Boat → Overview) |
| **Right-drag** | Orbit camera (Follow Player; Follow Boat snaps back to stern chase when released) |
| **Scroll** | Zoom |
| **Esc** | Pause menu |
| **`~`** | Dev Mode (live tweaks) |

## Dev Mode

Press **`~`** to open a panel with live server-side tweaks:

- **Weather** — wind angle/speed, auto-change, sail & leeway strength
- **Environment** — poke impulse, yaw, weathercock
- **Boats** — per boat-type stats (speed, drag, wind catch, mass, …)
- **Sticks** — power, accuracy, softness

**Reset** restores defaults. Changes apply immediately for everyone on that server.

## Project layout

```
toyboattoyboat/
├── client/          # Vite + Three.js frontend
│   └── src/
│       ├── Game.js
│       ├── DevMode.js
│       ├── BoatModels.js
│       └── …
├── server/          # Express + Socket.IO backend
│   └── server.js
├── PLAN.md          # Design notes / vision
└── package.json     # Workspaces root
```

## Multiplayer & deploy notes

- **Solo (local):** `npm run dev` is enough.
- **Multiplayer over the internet:** run the server where others can reach it (or via a Cloudflare Tunnel), then paste that Socket.IO URL in the multiplayer setup when not on localhost.
- GitHub Pages can host the built client; the game server still needs a reachable host for real-time play.

## License

Private project — all rights reserved unless otherwise noted.
