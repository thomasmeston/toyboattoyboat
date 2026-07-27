/**
 * On-screen hold Left/Right + Lasso + Pause for touch sessions.
 * Drives the same game.keys / emit helpers as the desktop keyboard path.
 */
export function bindMobileControls(game) {
  if (!game?.isTouchUi) return;

  const bindHold = (id, side) => {
    const el = document.getElementById(id);
    if (!el) return;

    const set = (down) => {
      game.keys[side] = down;
    };

    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      set(true);
    };

    const up = (e) => {
      e.preventDefault();
      set(false);
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', () => set(false));
  };

  bindHold('btn-mobile-left', 'left');
  bindHold('btn-mobile-right', 'right');

  document.getElementById('btn-mobile-lasso')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    game.emitLassoBoat();
  });

  document.getElementById('btn-mobile-pause')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    game.setMenuOpen(true);
  });

  // Release walk/steer if the page loses focus mid-hold
  window.addEventListener('blur', () => {
    game.keys.left = false;
    game.keys.right = false;
  });
}

export function releaseMobileKeys(game) {
  if (!game?.keys) return;
  game.keys.left = false;
  game.keys.right = false;
}
