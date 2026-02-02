import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for Moniezi
// Using base: './' makes the build work on GitHub Pages project sites and other static hosts.
export default defineConfig({
  plugins: [react()],
  base: './',
});
