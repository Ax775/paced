import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works on GitHub Pages project sites
  // (/Claude/), Netlify, and any subpath without reconfiguration.
  base: './',
  plugins: [react()],
  build: {
    target: 'es2018',
    sourcemap: true,
    outDir: 'dist',
  },
});
