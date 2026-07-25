const BOAT_LABELS = {
  standard: 'Wood Sailboat — steady poke, honest wind',
  cutter: 'Sloop — loves a breeze, hates a rock',
  pirate: 'Small Ship — hard to sink, harder to turn',
};

const STICK_LABELS = {
  wooden: 'Hickory Branch',
  brass: 'Polished Brass',
  ribbon: 'Ribbon Cane',
};

const BOAT_FIELDS = [
  { key: 'maxSpeed', label: 'Max Speed', min: 0.2, max: 12, step: 0.05 },
  { key: 'drag', label: 'Drag (retain)', min: 0.8, max: 0.999, step: 0.001 },
  { key: 'windCatch', label: 'Wind Catch', min: 0, max: 4, step: 0.05 },
  { key: 'mass', label: 'Mass', min: 0.2, max: 5, step: 0.05 },
  { key: 'durability', label: 'Durability', min: 0.2, max: 5, step: 0.05 },
  { key: 'turnRate', label: 'Turn Rate', min: 0, max: 1, step: 0.005 },
];

const STICK_FIELDS = [
  { key: 'power', label: 'Power', min: 0, max: 4, step: 0.05 },
  { key: 'accuracy', label: 'Accuracy', min: 0.2, max: 3, step: 0.05 },
  { key: 'softness', label: 'Softness', min: 0, max: 3, step: 0.05 },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatVal(n, step) {
  if (!Number.isFinite(n)) return '—';
  const decimals = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return n.toFixed(Math.min(4, Math.max(0, decimals)));
}

/**
 * In-game Dev Mode panel (~). Live-tweaks server weather, env, boat & stick stats.
 */
export class DevMode {
  constructor(socket) {
    this.open = false;
    this.settings = null;
    this._pending = null;
    this._raf = 0;
    this._needsRender = false;
    this.activeTab = 'weather';

    this.panel = document.getElementById('dev-panel');
    this.body = document.getElementById('dev-panel-body');
    this.tabButtons = [...document.querySelectorAll('#dev-panel .dev-tab')];

    if (!DevMode._uiBound) {
      DevMode._uiBound = true;
      this.tabButtons.forEach((btn) => {
        btn.addEventListener('click', () => this.setTab(btn.dataset.tab));
      });
      document.getElementById('dev-close')?.addEventListener('click', () => this.setOpen(false));
      document.getElementById('dev-reset')?.addEventListener('click', () => {
        this._needsRender = true;
        this.socket?.emit('devResetSettings');
      });
    }

    this.bindSocket(socket);
    this.setTab('weather');
  }

  bindSocket(socket) {
    if (this._onSettings && this.socket) {
      this.socket.off('devSettings', this._onSettings);
    }
    this.socket = socket;
    this._onSettings = (data) => {
      this.settings = data;
      if (this.open && this._needsRender) {
        this._needsRender = false;
        this.render();
      }
    };
    this.socket.on('devSettings', this._onSettings);
  }

  toggle() {
    this.setOpen(!this.open);
  }

  setOpen(open) {
    this.open = Boolean(open);
    this.panel?.classList.toggle('active', this.open);
    if (this.open) {
      this._needsRender = true;
      this.socket.emit('devGetSettings');
      if (this.settings) {
        this._needsRender = false;
        this.render();
      }
    }
  }

  setTab(tab) {
    this.activeTab = tab;
    this.tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    if (this.open && this.settings) this.render();
  }

  render() {
    if (!this.body || !this.settings) {
      if (this.body) this.body.innerHTML = '<p class="dev-hint">Loading settings…</p>';
      return;
    }

    this.body.innerHTML = '';
    if (this.activeTab === 'weather') this.renderWeather(this.body);
    else if (this.activeTab === 'environment') this.renderEnvironment(this.body);
    else if (this.activeTab === 'boats') this.renderBoats(this.body);
    else if (this.activeTab === 'sticks') this.renderSticks(this.body);
    else if (this.activeTab === 'sfx') this.renderSfx(this.body);
  }

  renderSfx(root) {
    const sfx = window.game?.sfx;
    if (!sfx) {
      root.append(el('p', 'dev-hint', 'Start a game first so SFX can unlock.'));
      return;
    }

    root.append(el('p', 'dev-hint', 'Poke sounds — choice is saved locally.'));
    const pokeList = el('div', 'dev-sfx-list');
    for (const opt of sfx.pokeOptions) {
      const row = el('div', 'dev-sfx-row');
      const selected = opt.id === sfx.pokeId;
      const useBtn = el('button', selected ? 'btn-primary' : 'btn-secondary', selected ? 'Selected' : 'Use');
      useBtn.type = 'button';
      useBtn.addEventListener('click', () => {
        sfx.setPokeId(opt.id);
        this.render();
      });
      const previewBtn = el('button', 'btn-secondary', 'Preview');
      previewBtn.type = 'button';
      previewBtn.addEventListener('click', () => sfx.previewPoke(opt.id));
      row.append(el('span', 'dev-sfx-label', opt.label), previewBtn, useBtn);
      pokeList.append(row);
    }
    root.append(pokeList);

    root.append(el('p', 'dev-hint', 'Ring score sounds — plays when you clear a ring.'));
    const ringList = el('div', 'dev-sfx-list');
    for (const opt of sfx.ringScoreOptions) {
      const row = el('div', 'dev-sfx-row');
      const selected = opt.id === sfx.ringScoreId;
      const useBtn = el('button', selected ? 'btn-primary' : 'btn-secondary', selected ? 'Selected' : 'Use');
      useBtn.type = 'button';
      useBtn.addEventListener('click', () => {
        sfx.setRingScoreId(opt.id);
        this.render();
      });
      const previewBtn = el('button', 'btn-secondary', 'Preview');
      previewBtn.type = 'button';
      previewBtn.addEventListener('click', () => sfx.previewRingScore(opt.id));
      row.append(el('span', 'dev-sfx-label', opt.label), previewBtn, useBtn);
      ringList.append(row);
    }
    root.append(ringList);
  }

  addSlider(parent, { label, value, min, max, step, onInput }) {
    const row = el('label', 'dev-row');
    const top = el('div', 'dev-row-top');
    top.append(el('span', 'dev-row-label', label));
    const valEl = el('span', 'dev-row-value', formatVal(value, step));
    top.append(valEl);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);

    input.addEventListener('input', () => {
      const n = Number(input.value);
      valEl.textContent = formatVal(n, step);
      onInput(n);
    });

    row.append(top, input);
    parent.append(row);
    return input;
  }

  addCheckbox(parent, { label, checked, onChange }) {
    const row = el('label', 'dev-check-row');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(checked);
    input.addEventListener('change', () => onChange(input.checked));
    row.append(input, el('span', null, label));
    parent.append(row);
    return input;
  }

  schedulePatch(patch) {
    // Coalesce rapid slider moves into one emit per frame
    this._pending = this._deepMerge(this._pending || {}, patch);
    // Keep local mirror snappy while waiting for server echo
    if (this.settings) this.settings = this._deepMerge(this.settings, patch);
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      const data = this._pending;
      this._pending = null;
      if (data) this.socket.emit('devSetSettings', data);
    });
  }

  _deepMerge(a, b) {
    const out = { ...a };
    for (const key of Object.keys(b)) {
      if (b[key] && typeof b[key] === 'object' && !Array.isArray(b[key])) {
        out[key] = this._deepMerge(a[key] || {}, b[key]);
      } else {
        out[key] = b[key];
      }
    }
    return out;
  }

  renderWeather(root) {
    const w = this.settings.weather;
    root.append(el('p', 'dev-hint', 'Live wind & sail response. Disable auto-change to lock a heading.'));

    this.addSlider(root, {
      label: 'Wind Angle (rad)',
      value: w.angle,
      min: -Math.PI,
      max: Math.PI,
      step: 0.01,
      onInput: (n) => this.schedulePatch({ weather: { angle: n } }),
    });

    this.addSlider(root, {
      label: 'Wind Speed (kn)',
      value: w.speed,
      min: 0,
      max: 20,
      step: 0.1,
      onInput: (n) => this.schedulePatch({ weather: { speed: n } }),
    });

    this.addCheckbox(root, {
      label: 'Auto-change wind',
      checked: w.autoChange,
      onChange: (v) => this.schedulePatch({ weather: { autoChange: v } }),
    });

    this.addSlider(root, {
      label: 'Change interval min (s)',
      value: w.changeMinSec,
      min: 1,
      max: 60,
      step: 1,
      onInput: (n) => this.schedulePatch({ weather: { changeMinSec: n } }),
    });

    this.addSlider(root, {
      label: 'Change interval max (s)',
      value: w.changeMaxSec,
      min: 1,
      max: 120,
      step: 1,
      onInput: (n) => this.schedulePatch({ weather: { changeMaxSec: n } }),
    });

    this.addSlider(root, {
      label: 'Sail accel coeff',
      value: w.sailAccel,
      min: 0,
      max: 0.01,
      step: 0.0001,
      onInput: (n) => this.schedulePatch({ weather: { sailAccel: n } }),
    });

    this.addSlider(root, {
      label: 'Leeway coeff',
      value: w.leeway,
      min: 0,
      max: 0.005,
      step: 0.00005,
      onInput: (n) => this.schedulePatch({ weather: { leeway: n } }),
    });

    root.append(el('p', 'dev-hint', `Phase: ${w.phase || 'breeze'}`));

    const phaseRow = el('div', 'dev-btn-row');
    for (const phase of ['breeze', 'gust', 'lull']) {
      const btn = el('button', 'btn-secondary', phase);
      btn.type = 'button';
      btn.addEventListener('click', () => this.schedulePatch({ weather: { phase } }));
      phaseRow.append(btn);
    }
    root.append(phaseRow);
  }

  renderEnvironment(root) {
    const e = this.settings.environment;
    root.append(el('p', 'dev-hint', 'Poke impulse, spin, and heading stability.'));

    const fields = [
      { key: 'pokeImpulse', label: 'Poke Impulse', min: 0, max: 3, step: 0.01 },
      { key: 'pokeYawKick', label: 'Poke Yaw Kick', min: 0, max: 1, step: 0.01 },
      { key: 'angularDrag', label: 'Angular Drag', min: 0.5, max: 0.999, step: 0.001 },
      { key: 'maxOmega', label: 'Max Omega', min: 0, max: 0.5, step: 0.005 },
      { key: 'pokeYawHold', label: 'Poke Yaw Hold (s)', min: 0, max: 3, step: 0.05 },
      { key: 'weathercockMaxStep', label: 'Weathercock Max Step', min: 0, max: 0.2, step: 0.005 },
    ];

    for (const f of fields) {
      this.addSlider(root, {
        label: f.label,
        value: e[f.key],
        min: f.min,
        max: f.max,
        step: f.step,
        onInput: (n) => this.schedulePatch({ environment: { [f.key]: n } }),
      });
    }
  }

  renderBoats(root) {
    root.append(el('p', 'dev-hint', 'Per boat-type sailing stats (applies to all boats of that type).'));
    for (const type of Object.keys(this.settings.boats)) {
      const stats = this.settings.boats[type];
      const section = el('section', 'dev-section');
      section.append(el('h3', 'dev-section-title', BOAT_LABELS[type] || type));
      for (const f of BOAT_FIELDS) {
        this.addSlider(section, {
          label: f.label,
          value: stats[f.key],
          min: f.min,
          max: f.max,
          step: f.step,
          onInput: (n) => this.schedulePatch({ boats: { [type]: { [f.key]: n } } }),
        });
      }
      root.append(section);
    }
  }

  renderSticks(root) {
    root.append(el('p', 'dev-hint', 'Per stick-type poke feel.'));
    for (const type of Object.keys(this.settings.sticks)) {
      const stats = this.settings.sticks[type];
      const section = el('section', 'dev-section');
      section.append(el('h3', 'dev-section-title', STICK_LABELS[type] || type));
      for (const f of STICK_FIELDS) {
        this.addSlider(section, {
          label: f.label,
          value: stats[f.key],
          min: f.min,
          max: f.max,
          step: f.step,
          onInput: (n) => this.schedulePatch({ sticks: { [type]: { [f.key]: n } } }),
        });
      }
      root.append(section);
    }
  }
}
