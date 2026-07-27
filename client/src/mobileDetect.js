/**
 * Coarse/touch detection for gating mobile UI and renderer profile.
 * Desktop fine-pointer sessions must keep the existing experience.
 */
export function detectTouchUi() {
  try {
    if (typeof window === 'undefined') return false;
    // Prefer primary input: coarse pointer / no-hover phones & tablets.
    // Do NOT treat touchscreen laptops (fine pointer + hover) as mobile UI.
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    const noHover = window.matchMedia?.('(hover: none)')?.matches;
    return !!(coarse || noHover);
  } catch {
    return false;
  }
}

export function applyTouchUiClass(isTouchUi) {
  document.body.classList.toggle('is-touch-ui', !!isTouchUi);
}
