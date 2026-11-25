import { defineConfig, loadEnv } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

// Local-only Fiddle Book Deployer. Not a PWA and never part of `npm run build` (that builds index.html only).
export default defineConfig(({ mode }) => {
  // R2_SECRET has no VITE_ prefix, so Vite keeps it out of the app's import.meta.env. Only the
  // deployer gets it, through define; the reader build never sees it.
  // loadEnv resolves envDir from the cwd (the repo root when run via npm), so '.' reads the repo's .env files.
  const { R2_SECRET = '' } = loadEnv(mode, '.', 'R2_SECRET')
  return {
    root: 'deployer',
    // Read VITE_* variables (e.g. VITE_R2_BASE_URL) from the app's .env files at the repo root.
    envDir: '..',
    define: {
      'import.meta.env.R2_SECRET': JSON.stringify(R2_SECRET),
    },
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
  }
})
