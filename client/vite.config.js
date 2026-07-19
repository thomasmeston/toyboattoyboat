import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5181,
    host: true, // Listen on all local IPs so friends can join locally
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
