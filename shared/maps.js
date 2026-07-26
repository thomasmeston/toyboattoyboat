/** Selectable play maps — shared by sim and client scenery. */

export const DEFAULT_MAP_ID = 'paris_fountain';

/**
 * @typedef {{ rx: number, rz: number }} Ellipse
 * @typedef {{
 *   solids: number,
 *   rings: number,
 *   solidMin: number,
 *   solidMax: number,
 *   ringMin: number,
 *   ringMax: number,
 *   solidClear: number,
 *   ringClear: number,
 *   weights?: { solid?: number, buoy?: number, leaf?: number, lilypad?: number },
 * }} ObstaclePlan
 */

/** @type {Record<string, object>} */
export const MAPS = {
  paris_fountain: {
    id: 'paris_fountain',
    name: 'Paris Fountain',
    subtitle: 'Dimanche au parc',
    blurb: 'Circular park basin',
    water: { rx: 100, rz: 100 },
    path: { rx: 104.5, rz: 104.5 },
    centerHazardRadius: 20,
    windScale: 1,
    sceneryKey: 'paris',
    paletteHint: 'paris',
    ambientKey: 'park',
    musicFile: 'dimanche-au-parc.mp3',
    fog: { near: 120, far: 320, color: 0xf6f3eb },
    obstaclePlan: {
      solids: 12,
      rings: 6,
      solidMin: 28,
      solidMax: 83,
      ringMin: 32,
      ringMax: 80,
      solidClear: 10,
      ringClear: 14,
      weights: { solid: 0.55, buoy: 0.15, leaf: 0.15, lilypad: 0.15 },
    },
  },
  conservatory_water: {
    id: 'conservatory_water',
    name: 'Conservatory Water',
    subtitle: 'Central Park · NYC',
    blurb: 'Central Park model boat pond',
    water: { rx: 120, rz: 95 },
    path: { rx: 124.5, rz: 99.5 },
    centerHazardRadius: 0,
    windScale: 1,
    sceneryKey: 'conservatory',
    paletteHint: 'nyc',
    ambientKey: 'park',
    musicFile: 'central-park-drift.mp3',
    fog: { near: 140, far: 380, color: 0xe8eef5 },
    obstaclePlan: {
      solids: 14,
      rings: 6,
      solidMin: 30,
      solidMax: 95,
      ringMin: 36,
      ringMax: 90,
      solidClear: 11,
      ringClear: 15,
      weights: { solid: 0.35, buoy: 0.15, leaf: 0.15, lilypad: 0.35 },
    },
  },
  echo_park_lake: {
    id: 'echo_park_lake',
    name: 'Echo Park Lake',
    subtitle: 'Los Angeles',
    blurb: 'LA swan-boat lake',
    // ~1.25× prior basin (was 140×110)
    water: { rx: 175, rz: 137.5 },
    path: { rx: 180.625, rz: 143.125 },
    centerHazardRadius: 10,
    windScale: 0.85,
    sceneryKey: 'echo_park',
    paletteHint: 'la',
    ambientKey: 'park',
    musicFile: 'palm-shade-loop.mp3',
    fog: { near: 175, far: 480, color: 0xf2ebe0 },
    // Fixed scenery solids (statue island) — sim collision, no duplicate mesh
    scenerySolids: [
      { id: 'echo_statue_island', x: -91, y: 12, radius: 20 },
    ],
    obstaclePlan: {
      solids: 16,
      rings: 7,
      solidMin: 42,
      solidMax: 138,
      ringMin: 50,
      ringMax: 131,
      solidClear: 15,
      ringClear: 20,
      weights: { solid: 0.3, buoy: 0.12, leaf: 0.18, lilypad: 0.4 },
    },
  },
};

export function listMaps() {
  return Object.values(MAPS);
}

export function getMap(mapId) {
  return MAPS[mapId] || MAPS[DEFAULT_MAP_ID];
}

export function normalizeMapId(mapId) {
  return MAPS[mapId] ? mapId : DEFAULT_MAP_ID;
}

/** Compact payload for initGame / client rebuild. */
export function mapPayload(mapId) {
  const m = getMap(mapId);
  return {
    id: m.id,
    name: m.name,
    subtitle: m.subtitle,
    water: { ...m.water },
    path: { ...m.path },
    centerHazardRadius: m.centerHazardRadius,
    sceneryKey: m.sceneryKey,
    paletteHint: m.paletteHint,
    fog: { ...m.fog },
  };
}
