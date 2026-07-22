import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages project site: set VITE_BASE=/toyboattoyboat/ in CI
  base: process.env.VITE_BASE || '/',
  root: '.',
  server: {
    port: 5181,
    host: true, // Listen on all local IPs so friends can join locally
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
