import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

// Local-only R2 deployer. Not a PWA and never part of `npm run build` (that builds index.html only).
export default defineConfig({
  root: 'deployer',
  // Read VITE_* variables (e.g. VITE_R2_BASE_URL) from the app's .env files at the repo root.
  envDir: '..',
  plugins: [preact(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    // The deployer imports ../../src/styles/app.css, which lives outside its root.
    fs: { allow: ['..'] },
  },
  build: {
    target: 'es2022',
    outDir: '../dist-deployer',
    emptyOutDir: true,
  },
})
