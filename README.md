# ToyBoatToyBoat

Casual multiplayer toy sailboat game. Move your boat around fountains to pass through obstacles and gain points.

Built as an npm workspaces monorepo: **Vite + Three.js** client and **Express + Socket.IO** server. Shared fountain simulation lives in `shared/fountainSim.js` (used by the live server and by offline Solo on GitHub Pages).

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
3. Guide the boat with stick pokes; wind (breeze, gusts, lulls) and water drag do the rest.
4. Sail through brass rings to score (streaks and double-clears with another boat pay bonus).
5. Optional **Courses** in the pause menu (**Esc** → Figure-eight, Island hop, Rim run) — timed runs with bronze/silver/gold and a personal best saved locally.

**Boats:** Sailboat is balanced; Sloop loves wind but dents easily; Ship tanks hits but turns slowly.

### Controls

| Input | Action |
|-------|--------|
| **A** / **D** or **←** / **→** | Walk left / right on the rim (Follow Player) |
| **A** / **D** or **←** / **→** | Steer the boat (Follow Boat view) |
| **Click** boat (or **Space** while aimed) | Stick poke |
| **E** | Lasso / reel boat toward you |
| **V** | Cycle camera (Follow Player → Follow Boat → Overview) |
| **Right-drag** | Orbit camera (Follow Player; Follow Boat snaps back to stern chase when released) |
| **Scroll** | Zoom |
| **Esc** | Pause menu |
| **`~`** | Dev Mode (live tweaks) |

## Dev Mode

Press **`~`** to open a panel with live server-side tweaks:

- **Weather** — wind angle/speed, auto-change, sail & leeway, phase overrides
- **Environment** — poke impulse, yaw, weathercock
- **Boats** — per boat-type stats (speed, drag, wind catch, mass, …)
- **Sticks** — power, accuracy, softness
- **SFX** — poke clip picker

**Reset** restores defaults. Changes apply immediately for everyone on that server.

## Project layout

```
toyboattoyboat/
├── client/          # Vite + Three.js frontend
│   └── src/
│       ├── Game.js
│       ├── SoloSocket.js   # offline Solo shim for Pages
│       ├── DevMode.js
│       └── …
├── server/          # Express + Socket.IO bridge
│   └── server.js
├── shared/
│   └── fountainSim.js     # shared physics / bots / scoring
├── PLAN.md
└── package.json
```

## Multiplayer & deploy notes

- **Solo (local):** `npm run dev` — uses the Socket.IO server with park bots.
- **Solo (GitHub Pages):** runs fully offline in the browser (same sim + bots). No tunnel required.
- **Multiplayer:** run the server where others can reach it (or via a Cloudflare Tunnel), then paste that Socket.IO URL in Multiplayer setup (or `?server=`).
- GitHub Pages hosts the client only; multiplayer still needs a reachable Socket.IO host.

## License

Private project — all rights reserved unless otherwise noted.
