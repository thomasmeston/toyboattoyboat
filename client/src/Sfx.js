/**
 * One-shot / loop SFX on the AmbientBeds volume channel.
 * Footsteps: Mixkit "Walking on grass" — https://mixkit.co (Mixkit License)
 * Poke options: Mixkit whoosh / tap / pop / tick / soft hit — https://mixkit.co
 * Gust: Mixkit "Storm wind" — https://mixkit.co (Mixkit License)
 * Ring score: Mixkit flute / glitter / coin / bonus / chime — https://mixkit.co
 * Duck quack: BigSoundBank "Ducks" (CC0) — https://bigsoundbank.com/ducks-s0276.html
 *   trimmed soft one-shot for boat pass-through
 */

import { assetUrl } from './assetUrl.js';

const FOOTSTEPS_URL = assetUrl('audio/footsteps-run.mp3');
const GUST_URL = assetUrl('audio/wind-gust.mp3');
const QUACK_URL = assetUrl('audio/duck-quack.mp3');

export const POKE_OPTIONS = [
  { id: 'whoosh', label: 'Soft whoosh (stick swing)', file: 'poke-opt-whoosh.mp3' },
  { id: 'tap', label: 'Light tap', file: 'poke-opt-tap.mp3' },
  { id: 'tick', label: 'Dry tick / click', file: 'poke-opt-tick.mp3' },
  { id: 'pop', label: 'Soft pop', file: 'poke-opt-pop.mp3' },
  { id: 'thud', label: 'Muted thud', file: 'poke-opt-thud.mp3' },
  { id: 'wood', label: 'Wood drop (old)', file: 'poke-wood.mp3' },
];

export const RING_SCORE_OPTIONS = [
  // Sparkle family (glitter-like; prefer the snappier ones over glitter shot's delayed hit)
  { id: 'sparkle_touch', label: 'Magic sparkle touch', file: 'ring-opt-sparkle-touch.mp3' },
  { id: 'sparkle_poof', label: 'Magic sparkle poof hit', file: 'ring-opt-sparkle-poof.mp3' },
  { id: 'wand_sparkle', label: 'Magic wand sparkle', file: 'ring-opt-wand-sparkle.mp3' },
  { id: 'fairy_glitter', label: 'Fairy glitter', file: 'ring-opt-fairy-glitter.mp3' },
  { id: 'fairy_sparkle', label: 'Fairy magic sparkle', file: 'ring-opt-fairy-sparkle.mp3' },
  { id: 'arcade_sparkle', label: 'Fairy arcade sparkle', file: 'ring-opt-arcade-sparkle.mp3' },
  { id: 'glitter_particles', label: 'Magic glitter particles', file: 'ring-opt-glitter-particles.mp3' },
  { id: 'glitter', label: 'Magic glitter shot (delayed)', file: 'ring-opt-glitter.mp3' },
  // Other pleasant scores
  { id: 'flute', label: 'Game flute bonus', file: 'ring-opt-flute.mp3' },
  { id: 'coin', label: 'Winning a coin', file: 'ring-opt-coin.mp3' },
  { id: 'bonus', label: 'Bonus earned', file: 'ring-opt-bonus.mp3' },
  { id: 'chime', label: 'Soft page chime', file: 'ring-opt-chime.mp3' },
];

const POKE_STORAGE = 'toyboattoyboat-poke-sfx';
const RING_STORAGE = 'toyboattoyboat-ring-sfx';
const RING_MIGRATE = 'toyboattoyboat-ring-sfx-arcade';
const DEFAULT_POKE = 'tap';
const DEFAULT_RING = 'arcade_sparkle';

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function makeAudio(url, { loop = false } = {}) {
  const a = new Audio(url);
  a.preload = 'auto';
  a.loop = loop;
  a.volume = 0;
  return a;
}

function makePool(url, size = 3) {
  return Array.from({ length: size }, () => makeAudio(url));
}

export class Sfx {
  constructor() {
    this._volume = 0.28;
    this._started = false;
    this._suspended = false;
    this._moving = false;
    this._footsteps = makeAudio(FOOTSTEPS_URL, { loop: true });
    this._pokeId = DEFAULT_POKE;
    try {
      const saved = localStorage.getItem(POKE_STORAGE);
      // Prefer an explicit saved pick, but migrate away from the old wood/whoosh defaults
      if (saved && POKE_OPTIONS.some((o) => o.id === saved) && saved !== 'wood' && saved !== 'whoosh') {
        this._pokeId = saved;
      } else {
        localStorage.setItem(POKE_STORAGE, DEFAULT_POKE);
      }
    } catch {
      /* ignore */
    }
    this._pokePools = Object.fromEntries(
      POKE_OPTIONS.map((o) => [o.id, makePool(assetUrl(`audio/${o.file}`), 3)]),
    );
    this._ringId = DEFAULT_RING;
    try {
      // One-time switch to Fairy Arcade Sparkle; later Dev Mode picks still persist
      if (!localStorage.getItem(RING_MIGRATE)) {
        localStorage.setItem(RING_STORAGE, DEFAULT_RING);
        localStorage.setItem(RING_MIGRATE, '1');
      }
      const savedRing = localStorage.getItem(RING_STORAGE);
      if (savedRing && RING_SCORE_OPTIONS.some((o) => o.id === savedRing)) {
        this._ringId = savedRing;
      } else {
        localStorage.setItem(RING_STORAGE, DEFAULT_RING);
      }
    } catch {
      /* ignore */
    }
    this._ringPools = Object.fromEntries(
      RING_SCORE_OPTIONS.map((o) => [o.id, makePool(assetUrl(`audio/${o.file}`), 3)]),
    );
    this._gustPool = makePool(GUST_URL, 2);
    this._quackPool = makePool(QUACK_URL, 3);
  }

  get pokeId() {
    return this._pokeId;
  }

  get pokeOptions() {
    return POKE_OPTIONS;
  }

  get ringScoreId() {
    return this._ringId;
  }

  get ringScoreOptions() {
    return RING_SCORE_OPTIONS;
  }

  setPokeId(id) {
    if (!this._pokePools[id]) return;
    this._pokeId = id;
    try {
      localStorage.setItem(POKE_STORAGE, id);
    } catch {
      /* ignore */
    }
  }

  setRingScoreId(id) {
    if (!this._ringPools[id]) return;
    this._ringId = id;
    try {
      localStorage.setItem(RING_STORAGE, id);
    } catch {
      /* ignore */
    }
  }

  setVolume(value) {
    this._volume = clamp01(value);
    if (this._moving && this._started) {
      this._footsteps.volume = clamp01(this._volume * 1.15);
    }
  }

  /** Unlock Audio from the Set Sail user gesture. */
  start() {
    this._started = true;
    const all = [
      this._footsteps,
      ...Object.values(this._pokePools).flat(),
      ...Object.values(this._ringPools).flat(),
      ...this._gustPool,
      ...this._quackPool,
    ];
    for (const a of all) {
      a.muted = true;
      a.volume = 0;
      const p = a.play();
      if (p?.then) {
        p.then(() => {
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        }).catch(() => {
          a.muted = false;
        });
      } else {
        a.muted = false;
      }
    }
  }

  /** Pause/resume for escape menu — stops loops and blocks one-shots. */
  setSuspended(suspended) {
    this._suspended = Boolean(suspended);
    if (this._suspended) {
      this._pauseAll();
      return;
    }
    if (this._moving && this._started) this._ensureFootstepsPlaying();
  }

  _allAudios() {
    return [
      this._footsteps,
      ...Object.values(this._pokePools).flat(),
      ...Object.values(this._ringPools).flat(),
      ...this._gustPool,
      ...this._quackPool,
    ];
  }

  _pauseAll() {
    for (const a of this._allAudios()) {
      try {
        a.pause();
        if (a !== this._footsteps) a.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    try {
      this._footsteps.currentTime = 0;
    } catch {
      /* ignore */
    }
  }

  setMoving(isMoving) {
    const next = Boolean(isMoving);
    if (next === this._moving) {
      if (next && this._started && !this._suspended) this._ensureFootstepsPlaying();
      return;
    }
    this._moving = next;
    if (!this._started) return;

    if (this._moving && !this._suspended) {
      this._ensureFootstepsPlaying();
    } else {
      try {
        this._footsteps.pause();
        this._footsteps.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }

  _ensureFootstepsPlaying() {
    if (this._suspended) return;
    const a = this._footsteps;
    a.volume = clamp01(this._volume * 1.15);
    if (a.paused) {
      a.play()?.catch?.(() => {});
    }
  }

  /** Kept for Game.animate compatibility; footsteps are loop-driven. */
  update() {}

  playPoke() {
    if (!this._started || this._suspended || this._volume <= 0.001) return;
    const pool = this._pokePools[this._pokeId] || this._pokePools[DEFAULT_POKE];
    this._playFromPool(pool, 1.05, 0.96 + Math.random() * 0.08);
  }

  /** Soft splash for boat-boat bumps (reuses whoosh clip). */
  playSplash(strength = 1) {
    if (!this._started || this._suspended || this._volume <= 0.001) return;
    const pool = this._pokePools.whoosh || this._pokePools[DEFAULT_POKE];
    const s = Math.min(1.4, Math.max(0.4, strength));
    this._playFromPool(pool, 0.35 * s, 0.85 + Math.random() * 0.15);
  }

  /** One-shot when the weather phase enters a gust. */
  playGust() {
    if (!this._started || this._suspended || this._volume <= 0.001) return;
    this._playFromPool(this._gustPool, 0.85, 0.92 + Math.random() * 0.12);
  }

  /** Pleasant score ping when the local boat clears a ring. */
  playRingScore() {
    if (!this._started || this._suspended || this._volume <= 0.001) return;
    const pool = this._ringPools[this._ringId] || this._ringPools[DEFAULT_RING];
    this._playFromPool(pool, 0.75, 0.97 + Math.random() * 0.06);
  }

  /** Soft short quack when a boat brushes a duck. */
  playQuack() {
    if (!this._started || this._suspended || this._volume <= 0.001) return;
    this._playFromPool(this._quackPool, 0.95, 0.92 + Math.random() * 0.16);
  }

  /** Preview the currently selected (or given) poke option. */
  previewPoke(id = this._pokeId) {
    if (!this._started) this.start();
    const pool = this._pokePools[id];
    if (!pool) return;
    this._playFromPool(pool, 0.8, 1);
  }

  previewRingScore(id = this._ringId) {
    if (!this._started) this.start();
    const pool = this._ringPools[id];
    if (!pool) return;
    this._playFromPool(pool, 0.8, 1);
  }

  _playFromPool(pool, volumeScale, rate) {
    if (this._suspended) return;
    const a = pool.find((x) => x.paused || x.ended) || pool[0];
    try {
      a.pause();
      a.currentTime = 0;
      a.playbackRate = rate;
      a.muted = false;
      a.volume = clamp01(this._volume * volumeScale);
      a.play()?.catch?.(() => {});
    } catch {
      /* ignore */
    }
  }
}
