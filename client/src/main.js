import { Game } from './Game.js';

window.addEventListener('DOMContentLoaded', () => {
  // Initialize the game instance
  window.game = new Game();

  // Production-only thin SW (Pages/base-aware). Skip in Vite dev to avoid stale caches.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).catch(() => {
      /* ignore registration failures */
    });
  }
});
