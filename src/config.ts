import { resolveBank } from './donate/banks'
import { cleanNote } from './donate/vietqr'

export interface DriveConfig {
  apiKey: string
  folderId: string
}

/**
 * Reads the Google Drive configuration from Vite env vars.
 * Returns null when either value is empty, whitespace-only, or undefined.
 */
export function getDriveConfig(
  env: Record<string, string | undefined> = import.meta.env,
): DriveConfig | null {
  const apiKey = (env.VITE_GD_API_KEY ?? '').trim()
  const folderId = (env.VITE_GD_FOLDER_ID ?? '').trim()
  if (apiKey === '' || folderId === '') return null
  return { apiKey, folderId }
}

export interface DonateConfig {
  bin: string
  bankName: string
  accountNo: string
  accountName: string
  note: string
}

/**
 * Reads the donate configuration from Vite env vars.
 * null when bank/accountNo/accountName is empty or bank is unknown.
 * accountNo is reduced to digits only (spaces and dots stripped).
 */
export function getDonateConfig(
  env: Record<string, string | undefined> = import.meta.env,
): DonateConfig | null {
  const bank = resolveBank(env.VITE_DONATE_BANK ?? '')
  const accountNo = (env.VITE_DONATE_ACCOUNT_NO ?? '').replace(/\D/g, '')
  const accountName = (env.VITE_DONATE_ACCOUNT_NAME ?? '').trim()
  if (bank === null || accountNo === '' || accountName === '') return null
  return {
    bin: bank.bin,
    bankName: bank.name,
    accountNo,
    accountName,
    note: cleanNote(env.VITE_DONATE_NOTE),
  }
}

export interface RequestFormConfig {
  formId: string
  entryTitle: string
  entryAuthor: string
  entryKey?: string
}

/** Accepts an entry id written as '123' or 'entry.123'; returns the bare id. */
function entryId(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^entry\./, '')
}

/**
 * Reads the Google Form configuration from Vite env vars.
 * null when formId or entryTitle is empty. entryAuthor may be ''.
 * entryKey is undefined when empty.
 */
export function getRequestFormConfig(
  env: Record<string, string | undefined> = import.meta.env,
): RequestFormConfig | null {
  const formId = (env.VITE_REQUEST_FORM_ID ?? '').trim()
  const entryTitle = entryId(env.VITE_REQUEST_ENTRY_TITLE)
  if (formId === '' || entryTitle === '') return null
  const entryKey = entryId(env.VITE_REQUEST_ENTRY_KEY)
  return {
    formId,
    entryTitle,
    entryAuthor: entryId(env.VITE_REQUEST_ENTRY_AUTHOR),
    entryKey: entryKey === '' ? undefined : entryKey,
  }
}
