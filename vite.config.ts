import { defineConfig } from 'vite';

// Minimal config. Vite serves src/main.ts referenced from index.html.
export default defineConfig({
  server: { open: true },
  build: { target: 'es2022' },
});
