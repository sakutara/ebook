/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GD_API_KEY?: string
  readonly VITE_GD_FOLDER_ID?: string
  readonly VITE_DONATE_BANK?: string
  readonly VITE_DONATE_ACCOUNT_NO?: string
  readonly VITE_DONATE_ACCOUNT_NAME?: string
  readonly VITE_DONATE_NOTE?: string
  readonly VITE_REQUEST_FORM_ID?: string
  readonly VITE_REQUEST_ENTRY_TITLE?: string
  readonly VITE_REQUEST_ENTRY_AUTHOR?: string
  readonly VITE_REQUEST_ENTRY_KEY?: string
}

declare const __APP_VERSION__: string
