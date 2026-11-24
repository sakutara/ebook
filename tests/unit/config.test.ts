import { describe, it, expect } from 'vitest'
import {
  getDonateConfig,
  getR2Config,
  getRequestFormConfig,
} from '../../src/config'

const DONATE_ENV = {
  VITE_DONATE_BANK: 'VCB',
  VITE_DONATE_ACCOUNT_NO: '0123 456.789',
  VITE_DONATE_ACCOUNT_NAME: 'NGUYEN VAN A',
  VITE_DONATE_NOTE: 'donate token dich truyen',
}

describe('donate.banner.config-missing: getDonateConfig', () => {
  it('donate.banner.config-missing: returns resolved bin, bank name, digits-only account and cleaned note', () => {
    expect(getDonateConfig(DONATE_ENV)).toEqual({
      bin: '970436',
      bankName: 'Vietcombank',
      accountNo: '0123456789',
      accountName: 'NGUYEN VAN A',
      note: 'donate token dich truyen',
    })
  })

  it('donate.banner.config-missing: resolves bank by bin, name and spaced alias', () => {
    for (const bank of ['970436', 'Vietcombank', ' viet com bank ']) {
      expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_BANK: bank })?.bin, bank).toBe('970436')
    }
  })

  it('donate.banner.config-missing: returns null when bank is empty or whitespace', () => {
    expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_BANK: '' })).toBeNull()
    expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_BANK: '   ' })).toBeNull()
    expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_BANK: undefined })).toBeNull()
  })

  it('donate.banner.config-missing: returns null when bank is unknown', () => {
    expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_BANK: 'xyz' })).toBeNull()
  })

  it('donate.banner.config-missing: returns null when account number is empty or whitespace', () => {
    expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_ACCOUNT_NO: '' })).toBeNull()
    expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_ACCOUNT_NO: ' . ' })).toBeNull()
    expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_ACCOUNT_NO: undefined })).toBeNull()
  })

  it('donate.banner.config-missing: returns null when account name is empty or whitespace', () => {
    expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_ACCOUNT_NAME: '' })).toBeNull()
    expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_ACCOUNT_NAME: '  ' })).toBeNull()
    expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_ACCOUNT_NAME: undefined })).toBeNull()
  })

  it('donate.note.default: note falls back to the default when VITE_DONATE_NOTE is unset', () => {
    const { VITE_DONATE_NOTE: _unused, ...env } = DONATE_ENV
    expect(getDonateConfig(env)?.note).toBe('donate token dich truyen')
  })

  it('donate.note.env: VITE_DONATE_NOTE is passed through cleanNote', () => {
    expect(getDonateConfig({ ...DONATE_ENV, VITE_DONATE_NOTE: 'Ủng hộ Tủ Truyện!' })?.note).toBe(
      'Ung ho Tu Truyen',
    )
  })
})

describe('story-request.config.missing: getRequestFormConfig', () => {
  const FORM_ENV = {
    VITE_REQUEST_FORM_ID: '1FAIpQLSexample',
    VITE_REQUEST_ENTRY_TITLE: 'entry.111',
    VITE_REQUEST_ENTRY_AUTHOR: '222',
    VITE_REQUEST_ENTRY_KEY: 'entry.333',
  }

  it('story-request.config.missing: returns form id, entry title, author and key', () => {
    expect(getRequestFormConfig(FORM_ENV)).toEqual({
      formId: '1FAIpQLSexample',
      entryTitle: '111',
      entryAuthor: '222',
      entryKey: '333',
    })
  })

  it('story-request.config.missing: entry ids accept both "entry.123" and "123"', () => {
    expect(getRequestFormConfig({ ...FORM_ENV, VITE_REQUEST_ENTRY_TITLE: '111' })?.entryTitle).toBe(
      '111',
    )
    expect(
      getRequestFormConfig({ ...FORM_ENV, VITE_REQUEST_ENTRY_TITLE: 'entry.111' })?.entryTitle,
    ).toBe('111')
  })

  it('story-request.config.missing: returns null when form id is empty or missing', () => {
    expect(getRequestFormConfig({ ...FORM_ENV, VITE_REQUEST_FORM_ID: '' })).toBeNull()
    expect(getRequestFormConfig({ ...FORM_ENV, VITE_REQUEST_FORM_ID: '  ' })).toBeNull()
    expect(getRequestFormConfig({ ...FORM_ENV, VITE_REQUEST_FORM_ID: undefined })).toBeNull()
  })

  it('story-request.config.missing: returns null when entry title is empty or missing', () => {
    expect(getRequestFormConfig({ ...FORM_ENV, VITE_REQUEST_ENTRY_TITLE: '' })).toBeNull()
    expect(getRequestFormConfig({ ...FORM_ENV, VITE_REQUEST_ENTRY_TITLE: undefined })).toBeNull()
  })

  it('story-request.config.missing: entry author may be empty string', () => {
    expect(getRequestFormConfig({ ...FORM_ENV, VITE_REQUEST_ENTRY_AUTHOR: '' })?.entryAuthor).toBe(
      '',
    )
    expect(
      getRequestFormConfig({ ...FORM_ENV, VITE_REQUEST_ENTRY_AUTHOR: undefined })?.entryAuthor,
    ).toBe('')
  })

  it('story-request.config.missing: entry key is undefined when empty', () => {
    expect(getRequestFormConfig({ ...FORM_ENV, VITE_REQUEST_ENTRY_KEY: '' })?.entryKey).toBeUndefined()
    expect(
      getRequestFormConfig({ ...FORM_ENV, VITE_REQUEST_ENTRY_KEY: undefined })?.entryKey,
    ).toBeUndefined()
  })

  it('story-request.config.missing: original title and language are read when set, undefined when empty', () => {
    const env = {
      ...FORM_ENV,
      VITE_REQUEST_ENTRY_ORIGINAL_TITLE: 'entry.444',
      VITE_REQUEST_ENTRY_LANGUAGE: '555',
    }
    expect(getRequestFormConfig(env)).toMatchObject({ entryOriginalTitle: '444', entryLanguage: '555' })
    const blank = getRequestFormConfig({
      ...FORM_ENV,
      VITE_REQUEST_ENTRY_ORIGINAL_TITLE: '',
      VITE_REQUEST_ENTRY_LANGUAGE: undefined,
    })
    expect(blank?.entryOriginalTitle).toBeUndefined()
    expect(blank?.entryLanguage).toBeUndefined()
  })
})

describe('app-shell.config.missing: getR2Config', () => {
  it('app-shell.config.missing: strips trailing slashes from the base url', () => {
    expect(getR2Config({ VITE_R2_BASE_URL: 'https://x.dev/' })).toEqual({ baseUrl: 'https://x.dev' })
    expect(getR2Config({ VITE_R2_BASE_URL: 'https://x.dev//' })).toEqual({ baseUrl: 'https://x.dev' })
  })

  it('app-shell.config.missing: keeps a base url without trailing slash and accepts http', () => {
    expect(getR2Config({ VITE_R2_BASE_URL: 'https://x.dev' })).toEqual({ baseUrl: 'https://x.dev' })
    expect(getR2Config({ VITE_R2_BASE_URL: 'http://localhost:8787/' })).toEqual({
      baseUrl: 'http://localhost:8787',
    })
  })

  it('app-shell.config.missing: trims whitespace around the base url', () => {
    expect(getR2Config({ VITE_R2_BASE_URL: '  https://x.dev/ \n' })).toEqual({
      baseUrl: 'https://x.dev',
    })
  })

  it('app-shell.config.missing: returns null for non-http(s) schemes', () => {
    expect(getR2Config({ VITE_R2_BASE_URL: 'ftp://x' })).toBeNull()
    expect(getR2Config({ VITE_R2_BASE_URL: 'javascript:alert(1)' })).toBeNull()
  })

  it('app-shell.config.missing: returns null for empty, whitespace, unparseable or missing value', () => {
    expect(getR2Config({ VITE_R2_BASE_URL: '' })).toBeNull()
    expect(getR2Config({ VITE_R2_BASE_URL: '   ' })).toBeNull()
    expect(getR2Config({ VITE_R2_BASE_URL: 'not a url' })).toBeNull()
    expect(getR2Config({})).toBeNull()
  })
})
