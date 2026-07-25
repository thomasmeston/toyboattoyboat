import { createFountainSim } from '../../shared/fountainSim.js';

export class SoloSocket {
  constructor() {
    this.id = null;
    this.connected = false;
    this._listeners = new Map();
    this._toyboatBound = false;
    this._sim = createFountainSim({
      onEmit: (event, payload, toPlayerId) => {
        if (toPlayerId === undefined || toPlayerId === this.id) {
          this._dispatch(event, payload);
        }
      },
    });
    this.connect();
  }

  on(event, listener) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(listener);
    return this;
  }

  once(event, listener) {
    const wrapped = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    wrapped.originalListener = listener;
    return this.on(event, wrapped);
  }

  off(event, listener) {
    if (event === undefined) {
      this._listeners.clear();
      return this;
    }
    if (listener === undefined) {
      this._listeners.delete(event);
      return this;
    }
    const listeners = this._listeners.get(event);
    if (!listeners) return this;
    for (const registered of listeners) {
      if (registered === listener || registered.originalListener === listener) {
        listeners.delete(registered);
      }
    }
    if (listeners.size === 0) this._listeners.delete(event);
    return this;
  }

  emit(event, data) {
    if (this.connected) this._sim.handle(this.id, event, data);
    return this;
  }

  connect() {
    if (this.connected) return this;
    this.id = this._sim.connect();
    this.connected = true;
    this._sim.start();
    // Sync so Game can set localId before joinGame runs
    this._dispatch('connect');
    return this;
  }

  disconnect() {
    if (!this.connected) return this;
    const oldId = this.id;
    this.connected = false;
    this._sim.disconnect(oldId);
    this._sim.stop();
    this.id = null;
    this._dispatch('disconnect', 'io client disconnect');
    return this;
  }

  removeAllListeners(event) {
    if (event === undefined) this._listeners.clear();
    else this._listeners.delete(event);
    return this;
  }

  _dispatch(event, ...args) {
    const listeners = this._listeners.get(event);
    if (!listeners) return;
    for (const listener of [...listeners]) listener(...args);
  }
}
