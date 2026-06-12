import { defineConfig } from 'vite';

// base './' so the built game runs from any static host (incl. GitHub Pages)
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
});
