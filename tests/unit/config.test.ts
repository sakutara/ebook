import { describe, it, expect } from 'vitest'
import { getDriveConfig, getDonateConfig, getRequestFormConfig } from '../../src/config'

describe('config', () => {
  it('config: returns apiKey and folderId when both set', () => {
    expect(getDriveConfig({ VITE_GD_API_KEY: 'k', VITE_GD_FOLDER_ID: 'f' })).toEqual({
      apiKey: 'k',
      folderId: 'f',
    })
  })

  it('config: returns null when api key empty', () => {
    expect(getDriveConfig({ VITE_GD_API_KEY: '', VITE_GD_FOLDER_ID: 'f' })).toBeNull()
  })

  it('config: returns null when folder id missing', () => {
    expect(getDriveConfig({ VITE_GD_API_KEY: 'k' })).toBeNull()
  })

  it('config: treats whitespace as empty', () => {
    expect(getDriveConfig({ VITE_GD_API_KEY: '  ', VITE_GD_FOLDER_ID: 'f' })).toBeNull()
  })

  it('config: trims returned values', () => {
    expect(getDriveConfig({ VITE_GD_API_KEY: ' k ', VITE_GD_FOLDER_ID: ' f\n' })).toEqual({
      apiKey: 'k',
      folderId: 'f',
    })
  })
})

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
})
