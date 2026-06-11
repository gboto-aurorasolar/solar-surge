import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` must match the GitHub Pages subpath (the repo name) for built
// asset URLs to resolve at https://<user>.github.io/solar-surge/.
// Dev keeps the root base so the local server stays at "/".
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/solar-surge/' : '/',
  plugins: [react()],
  server: { port: 5180, open: true },
}));
