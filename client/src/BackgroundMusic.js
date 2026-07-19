const STORAGE_KEY = 'toyboattoyboat-music';
const TRACK_URL = '/audio/dimanche-au-parc.mp3';
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

/**
 * Looping level BGM — "Dimanche au parc".
 * Starts on a user gesture (Set Sail) to satisfy autoplay rules.
 */
export class BackgroundMusic {
  constructor() {
    const prefs = loadPrefs();
    this._volume = clamp01(typeof prefs.volume === 'number' ? prefs.volume : DEFAULT_VOLUME);
    this._muted = Boolean(prefs.muted);

    this.audio = new Audio(TRACK_URL);
    this.audio.loop = true;
    this.audio.preload = 'auto';
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

  /** Begin playback (call from a click handler). */
  start() {
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
