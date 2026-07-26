import { assetUrl } from './assetUrl.js';
import { getMap, DEFAULT_MAP_ID } from '../../shared/maps.js';

const STORAGE_KEY = 'toyboattoyboat-music';
const DEFAULT_FILE = 'dimanche-au-parc.mp3';
const DEFAULT_VOLUME = 0.45;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
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

function musicFileForMap(mapId) {
  const map = getMap(mapId);
  return map.musicFile || DEFAULT_FILE;
}

/**
 * Looping level BGM — track follows the active map.
 * Starts on a user gesture (Set Sail) to satisfy autoplay rules.
 */
export class BackgroundMusic {
  constructor() {
    const prefs = loadPrefs();
    this._volume = clamp01(typeof prefs.volume === 'number' ? prefs.volume : DEFAULT_VOLUME);
    this._muted = Boolean(prefs.muted);
    this._started = false;
    this._file = null;

    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.setForMap(DEFAULT_MAP_ID);
    this._apply();
  }

  _save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ volume: this._volume, muted: this._muted }),
      );
    } catch {
      /* ignore quota / private mode */
    }
  }

  _apply() {
    this.audio.muted = this._muted;
    this.audio.volume = this._muted ? 0 : this._volume;
  }

  get volume() {
    return this._volume;
  }

  get muted() {
    return this._muted;
  }

  /** Switch BGM to the track for a map id (or map object with musicFile / id). */
  setForMap(mapOrId) {
    const mapId = typeof mapOrId === 'string' ? mapOrId : mapOrId?.id;
    const file = typeof mapOrId === 'object' && mapOrId?.musicFile
      ? mapOrId.musicFile
      : musicFileForMap(mapId);
    if (file === this._file) return;

    const wasPlaying = this._started && !this.audio.paused;
    this._file = file;
    this.audio.src = assetUrl(`audio/${file}`);
    this.audio.load();
    this._apply();

    if (wasPlaying) {
      this.audio.currentTime = 0;
      const play = this.audio.play();
      if (play?.catch) play.catch(() => {});
    }
  }

  /** Begin playback (call from a click handler). */
  start() {
    this._started = true;
    this._apply();
    const play = this.audio.play();
    if (play?.catch) play.catch(() => {});
  }

  setVolume(value) {
    this._volume = clamp01(value);
    if (!this._muted) this.audio.volume = this._volume;
    this._save();
  }

  setMuted(muted) {
    this._muted = Boolean(muted);
    this._apply();
    this._save();
  }

  toggleMute() {
    this.setMuted(!this._muted);
    return this._muted;
  }
}
