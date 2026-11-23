/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Admin code, replaced at build time by vite.deployer.config.ts from .env.local (see define). */
  readonly R2_SECRET?: string
}
