import type { DonateConfig } from '../config'
import { formatVnd } from './vietqr'
import { qrMatrix } from './qr-matrix'

const WIDTH = 720
const HEIGHT = 1000
const QR_SIZE = 600
const QR_TOP = 100
const QUIET_ZONE = 4

export function pngFileName(amount: number): string {
  return `ung-ho-${amount}.png`
}

/**
 * 720×1000 canvas, white bg, dark #111: heading, QR centred, then amount, bank name,
 * account name, account no and the transfer note. Returns the PNG as a Blob.
 */
export async function renderQrPng(p: { payload: string; amount: number; cfg: DonateConfig }): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#111111'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.font = 'bold 36px sans-serif'
  ctx.fillText('Ủng hộ token dịch truyện', WIDTH / 2, 50)

  const modules = qrMatrix(p.payload)
  const total = modules.length + QUIET_ZONE * 2
  const scale = QR_SIZE / total
  const x0 = (WIDTH - QR_SIZE) / 2
  modules.forEach((row, r) => {
    row.forEach((dark, c) => {
      if (dark) {
        ctx.fillRect(x0 + (c + QUIET_ZONE) * scale, QR_TOP + (r + QUIET_ZONE) * scale, scale, scale)
      }
    })
  })

  const textTop = QR_TOP + QR_SIZE + 50
  const lines: Array<[string, string]> = [
    [`${formatVnd(p.amount)} ₫`, 'bold 48px sans-serif'],
    [p.cfg.bankName, '32px sans-serif'],
    [p.cfg.accountName, '32px sans-serif'],
    [p.cfg.accountNo, '32px sans-serif'],
    [`Nội dung: ${p.cfg.note}`, '28px sans-serif'],
  ]
  lines.forEach(([text, font], i) => {
    ctx.font = font
    ctx.fillText(text, WIDTH / 2, textTop + i * 60)
  })

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
      'image/png',
    )
  })
}

/** Saves a Blob through a temporary <a download> link, as SettingsPage.onExport does. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
