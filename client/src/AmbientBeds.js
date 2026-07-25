/**
 * View-mode ambient beds (SFX channel, separate from BGM).
 * Park: Mixkit "Morning sound in a garden" — https://mixkit.co (Mixkit License)
 * Sea:  Mixkit "Wooden ship on the sea" — https://mixkit.co (Mixkit License)
 * One-shots (footsteps / poke) live in Sfx.js on the same volume slider.
 */

import { assetUrl } from './assetUrl.js';

const PARK_URL = assetUrl('audio/ambient-park.mp3');
const SEA_URL = assetUrl('audio/ambient-sea.mp3');
const STORAGE_KEY = 'toyboattoyboat-sfx';
const DEFAULT_VOLUME = 0.28;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function makeLoop(url) {
  const audio = new Audio(url);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;
  return audio;
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export class AmbientBeds {
  constructor() {
    const prefs = loadPrefs();
    this._volume = clamp01(typeof prefs.volume === 'number' ? prefs.volume : DEFAULT_VOLUME);
    this.park = makeLoop(PARK_URL);
    this.sea = makeLoop(SEA_URL);
    this._mode = 'follow';
    this._started = false;
  }

  get volume() {
    return this._volume;
  }

  setVolume(value) {
    this._volume = clamp01(value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: this._volume }));
    } catch {
      /* ignore */
    }
    this.apply();
  }

  /** Call from the same user gesture that starts BGM. */
  start() {
    this._started = true;
    this.apply();
    const parkPlay = this.park.play();
    const seaPlay = this.sea.play();
    if (parkPlay?.catch) parkPlay.catch(() => {});
    if (seaPlay?.catch) seaPlay.catch(() => {});
  }

  setMode(mode) {
    this._mode = mode;
    this.apply();
  }

  apply() {
    if (!this._started) return;

    const parkOn = this._mode === 'follow';
    const seaOn = this._mode === 'followBoat';
    const level = this._volume;

    this.park.volume = parkOn ? level : 0;
    this.sea.volume = seaOn ? level : 0;

    if (parkOn && this.park.paused) this.park.play()?.catch?.(() => {});
    if (seaOn && this.sea.paused) this.sea.play()?.catch?.(() => {});
  }
}
