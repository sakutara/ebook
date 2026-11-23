export const DEFAULT_NOTE = 'donate token dich truyen'

export const MIN_AMOUNT = 1000
export const MAX_AMOUNT = 50_000_000
export const PRESETS = [10000, 20000, 50000, 100000]

const NOTE_MAX = 25

/** ASCII-fold (NFD, drop marks, đ→d), disallowed chars → space, collapse spaces, trim, cut to 25, trim again; '' → DEFAULT_NOTE. */
export function cleanNote(raw: string | undefined): string {
  const cleaned = (raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOTE_MAX)
    .trim()
  return cleaned === '' ? DEFAULT_NOTE : cleaned
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 uppercase hex digits. */
export function crc16(s: string): string {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(s)) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value
}

export function buildVietQr(p: { bin: string; accountNo: string; amount: number; note: string }): string {
  const payload =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv(
      '38',
      tlv('00', 'A000000727') +
        tlv('01', tlv('00', p.bin) + tlv('01', p.accountNo)) +
        tlv('02', 'QRIBFTTA'),
    ) +
    tlv('53', '704') +
    tlv('54', String(p.amount)) +
    tlv('58', 'VN') +
    tlv('62', tlv('08', p.note)) +
    '6304'
  return payload + crc16(payload)
}

/** 50000 → '50.000' (dot groups, no locale dependency). */
export function formatVnd(n: number): string {
  const digits = String(Math.trunc(n))
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Strip non-digits; null if empty or outside [MIN_AMOUNT, MAX_AMOUNT]. */
export function parseAmount(text: string): number | null {
  const digits = text.replace(/\D/g, '')
  if (digits === '') return null
  const n = Number(digits)
  if (n < MIN_AMOUNT || n > MAX_AMOUNT) return null
  return n
}
