# ToyBoatToyBoat — Game Plan

## Vision

**ToyBoatToyBoat** is a casual toy-boat sailing game. Players walk the rim of small bodies of water with long pushsticks, guiding paper sailboats through obstacles and completing light missions. The tone is playful and tactile — like a sunny afternoon at a park fountain, not a hardcore racing sim.

Each session starts with personalization: pick your boat, your stick, and your colors and flag. Then sail, poke, dodge, and explore.

---

## Core Fantasy

You are a kid (or kid-at-heart) at the edge of a pond, fountain, or miniature water course. Your boat is small. The water is shallow. Your tool is a stick. Wind pushes the sail; rocks, buoys, and lily pads get in the way; other players share the same water.

Success feels like gentle mastery: reading the wind, timing a poke, slipping past an obstacle, finishing a silly mission.

---

## Core Gameplay Loop

1. **Customize** — Choose boat type, hull color, flag color/symbol, and pushstick style.
2. **Enter the map** — Spawn at the water's edge on a walkable path around the body of water.
3. **Move** — Walk the rim (keyboard or pointer) to stay near your boat.
4. **Sail & poke** — Wind drives the boat; you extend your stick to nudge it. Collisions with obstacles damage the boat; too much damage and it sinks.
5. **Mission** — Complete the map's goal (reach a marker, collect items, race a lap, etc.).
6. **Repeat** — Try another map, another boat, or play with friends.

---

## Player Customization (Session Start)

Every player configures their setup before launching:

| Choice | Options (current / planned) |
|--------|-----------------------------|
| **Boat** | Classic fold, cutter rig, galleon (more hulls over time) |
| **Colors** | Hull color, flag color |
| **Flag** | Symbol (star, heart, anchor, moon; more later) |
| **Pushstick** | Wooden branch, polished brass, ribbon cane (more later) |

Customization is cosmetic-first but should remain readable in multiplayer so players can spot their boat at a glance.

---

## Maps & Progression

Maps are self-contained **levels** — each a small body of water with its own layout, obstacles, scenery, and mission. Players can jump between unlocked maps or replay favorites.

### Map 1 — Parisian Park Fountain *(starting map, in progress)*

A large circular fountain in a Parisian park. Players walk a cobblestone path around the rim while paper boats sail the basin.

- **Water:** Circular fountain with wind-affected sailing
- **Terrain:** Park grass, trees, stone rim, cobble path
- **Obstacles:** Rocks, buoys, leaves, lily pads scattered in the basin
- **Mini islands:** Small islands/obstacle clusters in the middle *(planned — not yet in build)*
- **Missions:** TBD (e.g. touch all buoys, survive without sinking, reach the center island)

### Future Maps

| Map | Setting | Notes |
|-----|---------|-------|
| **Man-made lake** | Rectangular or irregular lake, docks, reeds | Calmer wind, longer crossings |
| **Garden pond** | Small intimate pond, stepping stones, koi-ish vibe | Tight quarters, precision poking |
| **Mini-golf course** | Water hazards between whimsical holes | Sequential checkpoints as "holes" |
| **Other fountains** | Town square, museum courtyard, plaza | Reuse fountain mechanics with new scenery skins |

Each map should define: water shape, walk path, obstacle set, wind profile, mission type, and ambient scenery.

---

## Missions

Missions give players a reason to sail beyond free play. Keep them short and replayable.

**Mission types to support over time:**

- **Reach** — Sail to a marked zone (center island, far buoy, finish line)
- **Collect** — Touch or pass near scattered targets
- **Survive** — Stay afloat for a time limit or complete a lap without sinking
- **Race** — First to a sequence of checkpoints (solo time trial or multiplayer)
- **Escort / herd** — Keep a loose object in a zone (future silliness)

Missions should work in solo and multiplayer. Multiplayer can be cooperative (shared goal) or light competition (first finish, high score).

---

## Multiplayer

Several players share one map instance:

- Each player has their own avatar on the rim, boat in the water, and stick
- Server-authoritative physics (wind, collisions, damage, poke forces)
- Real-time state sync over WebSocket (Socket.IO)

Social feel matters: seeing other boats bob, watching someone else's stick poke, reacting to near misses.

---

## Art & Tone

- **Visual style:** Papercraft / pastel low-poly — warm, matte, handcrafted (think sunny park, folded paper boats, cardboard trees)
- **Camera:** Isometric follow cam with optional fixed overview
- **Audio *(planned)*:** Gentle water, wind, soft park ambience, satisfying poke sounds
- **Mood:** Cozy, low-stakes, good for short sessions

---

## Technical Direction

| Layer | Stack |
|-------|-------|
| Client | Vite, Three.js, Socket.IO client |
| Server | Node, Express, Socket.IO |
| Architecture | Monorepo (`client` + `server` workspaces) |

**Principles:**

- Server owns game state and physics tick (~30 Hz)
- Client renders, interpolates, and handles input/UI
- Map data should eventually be data-driven (JSON or similar) so new levels don't require core rewrites
- Keep scope small per map: one water body, one path, one mission set

---

## Current Build Status

What exists today (Parisian fountain prototype):

- [x] Boat customization lobby (boat, colors, flag, stick)
- [x] Multiplayer join, movement, and state sync
- [x] Pushstick poke mechanic with animation
- [x] Wind simulation and HUD vane
- [x] Obstacle spawning (rock, buoy, leaf, lily pad)
- [x] Collision damage and sink / respawn flow
- [x] Parisian park scenery (fountain rim, path, grass, trees)
- [x] Follow and fixed camera modes
- [ ] Mini islands in fountain center
- [ ] Mission system
- [ ] Map select / level progression
- [ ] Additional maps
- [ ] Audio
- [ ] Mobile-friendly controls polish

---

## Milestones (Suggested)

### M1 — Playable Fountain
Solidify Map 1: mini islands, one simple mission, polish sink/respawn and multiplayer feel.

### M2 — Mission Framework
Data-driven missions reusable across maps; win/lose UI; optional timer and score.

### M3 — Map Pipeline
Extract map config (geometry, obstacles, spawn points, missions) so Map 2 (pond or lake) ships without duplicating engine code.

### M4 — Content Expansion
Ship 2–3 additional maps (mini-golf course, second fountain) and expand customization options.

### M5 — Polish & Ship
Audio, UX pass, performance, deployment, playtest feedback.

---

## Open Questions

- Solo-only mode or always-online multiplayer?
- Persistent unlocks (boats, maps) or session-only customization?
- Competitive scoring vs purely casual play?
- Target platforms (desktop browser first; mobile later?)

These can be decided as M1 playtesting clarifies who the primary audience is.

---

## One-Line Pitch

*Pick your paper boat and stick, then sail a sunny fountain with friends — poke past obstacles, catch the wind, and finish goofy missions across ponds, lakes, and mini-golf water hazards.*
