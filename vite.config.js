import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the build works on GitHub Pages project sites
  // (/Claude/), Netlify, and any subpath without reconfiguration.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',   // new deploy → SW updates itself
      injectRegister: null,         // we register manually from main.jsx (CSP-safe, no inline script)
      manifest: false,              // reuse existing public/manifest.json
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: 'index.html',  // app shell serves offline / during deploy blips
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2018',
    sourcemap: true,
    outDir: 'dist',
  },
});
