import { describe, expect, it } from 'vitest'
import { BANKS, resolveBank } from '../../src/donate/banks'
import {
  DEFAULT_NOTE,
  MAX_AMOUNT,
  MIN_AMOUNT,
  PRESETS,
  buildVietQr,
  cleanNote,
  crc16,
  formatVnd,
  parseAmount,
} from '../../src/donate/vietqr'

describe('donate.qr.payload: crc16 and payload builder', () => {
  it('donate.qr.payload: crc16 matches CRC-16/CCITT-FALSE test vector', () => {
    expect(crc16('123456789')).toBe('29B1')
  })

  it('donate.qr.payload: contains every required TLV substring', () => {
    const p = buildVietQr({
      bin: '970436',
      accountNo: '0123456789',
      amount: 20000,
      note: 'donate token dich truyen',
    })
    for (const part of [
      '0010A000000727',
      '010212',
      '00069704360110' + '0123456789',
      '0208QRIBFTTA',
      '5303704',
      '540520000',
      '5802VN',
      '0824donate token dich truyen',
    ]) {
      expect(p).toContain(part)
    }
  })

  it('donate.qr.payload: starts with header and ends with 6304 + uppercase CRC of preceding content', () => {
    const p = buildVietQr({
      bin: '970436',
      accountNo: '0123456789',
      amount: 20000,
      note: 'donate token dich truyen',
    })
    expect(p.startsWith('000201010212')).toBe(true)
    const body = p.slice(0, -4)
    expect(body.endsWith('6304')).toBe(true)
    expect(p.slice(-4)).toMatch(/^[0-9A-F]{4}$/)
    expect(p.slice(-4)).toBe(crc16(body))
  })
})

describe('donate.qr.bank-alias: resolveBank', () => {
  it('donate.qr.bank-alias: resolves code, name, bin and spaced variants to Vietcombank', () => {
    for (const input of ['vcb', 'Vietcombank', '970436', ' viet com bank ']) {
      const bank = resolveBank(input)
      expect(bank, input).not.toBeNull()
      expect(bank?.bin).toBe('970436')
      expect(bank?.name).toBe('Vietcombank')
    }
  })

  it('donate.qr.bank-alias: unknown bank returns null', () => {
    expect(resolveBank('xyz')).toBeNull()
  })

  it('donate.qr.bank-alias: empty input returns null', () => {
    expect(resolveBank('')).toBeNull()
    expect(resolveBank('   ')).toBeNull()
  })

  it('donate.qr.bank-alias: bank table has unique bins', () => {
    const bins = BANKS.map((b) => b.bin)
    expect(new Set(bins).size).toBe(bins.length)
  })
})

describe('donate.note.default: cleanNote', () => {
  it('donate.note.default: undefined and empty input fall back to the default note', () => {
    expect(cleanNote(undefined)).toBe('donate token dich truyen')
    expect(cleanNote('')).toBe('donate token dich truyen')
    expect(DEFAULT_NOTE).toBe('donate token dich truyen')
  })
})

describe('donate.note.env: cleanNote ASCII folding', () => {
  it('donate.note.env: folds accents, maps đ to d and strips punctuation', () => {
    expect(cleanNote('Ủng hộ Tủ Truyện!')).toBe('Ung ho Tu Truyen')
  })

  it('donate.note.env: punctuation becomes a space', () => {
    expect(cleanNote('a-b')).toBe('a b')
    expect(cleanNote('a--b')).toBe('a b')
    expect(cleanNote('a.b,c')).toBe('a b c')
    expect(cleanNote('Ủng hộ Tủ Truyện!')).toBe('Ung ho Tu Truyen')
  })
})

describe('donate.note.too-long: cleanNote length limit', () => {
  it('donate.note.too-long: 40-char note is cut to 25 chars with no trailing space', () => {
    const note = 'donate token dich truyen ' + 'x'.repeat(15)
    expect(note.length).toBe(40)
    const cleaned = cleanNote(note)
    expect(cleaned.length).toBeLessThanOrEqual(25)
    expect(cleaned.endsWith(' ')).toBe(false)
    expect(cleaned).toBe('donate token dich truyen')
  })

  it('donate.note.too-long: encoded payload uses the cleaned, cut note', () => {
    const note = cleanNote('abcdefghijklmnopqrstuvwxy zzzzzzzzzzzzzzz')
    expect(note.length).toBeLessThanOrEqual(25)
    const p = buildVietQr({ bin: '970436', accountNo: '0123456789', amount: 20000, note })
    expect(p).toContain('08' + String(note.length).padStart(2, '0') + note)
  })
})

describe('donate.amount.custom: formatVnd and constants', () => {
  it('donate.amount.custom: formats whole đồng with dot thousands separators', () => {
    expect(formatVnd(50000)).toBe('50.000')
    expect(formatVnd(1000000)).toBe('1.000.000')
    expect(formatVnd(999)).toBe('999')
  })

  it('donate.amount.custom: exposes limits and presets', () => {
    expect(MIN_AMOUNT).toBe(1000)
    expect(MAX_AMOUNT).toBe(50_000_000)
    expect(PRESETS).toEqual([10000, 20000, 50000, 100000])
  })
})

describe('donate.amount.invalid: parseAmount', () => {
  it('donate.amount.invalid: parses dot-grouped digits', () => {
    expect(parseAmount('35.000')).toBe(35000)
  })

  it('donate.amount.invalid: below minimum returns null', () => {
    expect(parseAmount('999')).toBeNull()
  })

  it('donate.amount.invalid: empty input returns null', () => {
    expect(parseAmount('')).toBeNull()
  })

  it('donate.amount.invalid: above maximum returns null', () => {
    expect(parseAmount('50000001')).toBeNull()
  })

  it('donate.amount.invalid: boundaries 1.000 and 50.000.000 are accepted', () => {
    expect(parseAmount('1.000')).toBe(1000)
    expect(parseAmount('50.000.000')).toBe(50_000_000)
  })
})
