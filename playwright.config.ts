import { defineConfig, devices } from '@playwright/test'

const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://localhost:4173${base}` },
  // Two servers: the production build of the app (real service worker) on 4173, and the local
  // deployer dev server on 5174. Deployer specs use the absolute http://localhost:5174/ URL.
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      port: 4173,
      reuseExistingServer: false,
      env: {
        VITE_R2_BASE_URL: 'https://r2.test',
        VITE_DONATE_BANK: 'VCB',
        VITE_DONATE_ACCOUNT_NO: '0123456789',
        VITE_DONATE_ACCOUNT_NAME: 'NGUYEN VAN A',
        VITE_REQUEST_FORM_ID: 'test-form',
        VITE_REQUEST_ENTRY_TITLE: '111',
        VITE_REQUEST_ENTRY_AUTHOR: '222',
        VITE_REQUEST_ENTRY_KEY: '333',
      },
    },
    {
      command: 'npx vite --config vite.deployer.config.ts',
      port: 5174,
      reuseExistingServer: false,
      env: { VITE_R2_BASE_URL: 'https://r2.test' },
    },
  ],
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
})
