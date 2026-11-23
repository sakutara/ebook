import { placeholderHue } from '../../src/ui/library/CoverImage'
import { normalize } from '../../src/domain/title'

export interface Canvasish {
  width: number
  height: number
  getContext(t: '2d'): CanvasRenderingContext2D | null
  toBlob(cb: (b: Blob | null) => void, type: string, q: number): void
}

export interface CoverDeps {
  createCanvas?: (w: number, h: number) => Canvasish
  loadImage?: (b: Blob) => Promise<{ width: number; height: number; source: CanvasImageSource; close?: () => void }>
}

const COVER_W = 600
const COVER_H = 900
const JPEG_TYPE = 'image/jpeg'
const JPEG_QUALITY = 0.85
const PAD = 48
const TEXT_W = COVER_W - PAD * 2
const TITLE_FONT = 'bold 56px system-ui'
const TITLE_LINE_H = 68
const TITLE_MAX_LINES = 6
const TITLE_TOP = 120
const AUTHOR_FONT = '32px system-ui'
const AUTHOR_LINE_H = 40
const AUTHOR_MAX_LINES = 2
const AUTHOR_GAP = 24

/** Scale to at most maxW wide, keeping aspect ratio. Never upscales. */
export function targetSize(w: number, h: number, maxW = 600): { width: number; height: number } {
  const scale = Math.min(1, maxW / w)
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}

const defaultCreateCanvas = (w: number, h: number): Canvasish => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c as unknown as Canvasish
}

const defaultLoadImage: NonNullable<CoverDeps['loadImage']> = async (b) => {
  const bitmap = await createImageBitmap(b)
  return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() }
}

function toBlob(canvas: Canvasish): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), JPEG_TYPE, JPEG_QUALITY)
  })
}

function context2d(canvas: Canvasish): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  return ctx
}

/** Shorten words from the end until `text…` fits; falls back to trimming characters. */
function fitWithEllipsis(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number): string {
  const fits = (s: string) => ctx.measureText(`${s}…`).width <= maxWidth
  const words = text.split(/\s+/).filter(Boolean)
  while (words.length > 1 && !fits(words.join(' '))) words.pop()
  let s = words.join(' ')
  while (s.length > 0 && !fits(s)) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

/** Greedy word wrap. When text exceeds maxLines, the last line is shortened and ends with '…'. */
export function wrapLines(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)

  if (lines.length <= maxLines) return lines

  const kept = lines.slice(0, maxLines - 1)
  const rest = lines.slice(maxLines - 1).join(' ')
  kept.push(fitWithEllipsis(ctx, rest, maxWidth))
  return kept
}

/** Blob → JPEG Blob, at most 600 px wide, white behind transparency. */
export async function toCoverJpeg(img: Blob, deps: CoverDeps = {}): Promise<Blob> {
  const loadImage = deps.loadImage ?? defaultLoadImage
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas
  const decoded = await loadImage(img)
  try {
    const { width, height } = targetSize(decoded.width, decoded.height, COVER_W)
    const canvas = createCanvas(width, height)
    const ctx = context2d(canvas)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(decoded.source, 0, 0, width, height)
    return await toBlob(canvas)
  } finally {
    decoded.close?.()
  }
}

/** 600×900 JPEG placeholder: hue from the normalised title, title and author in white. */
export async function generateCover(title: string, author: string, deps: CoverDeps = {}): Promise<Blob> {
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas
  const canvas = createCanvas(COVER_W, COVER_H)
  const ctx = context2d(canvas)

  ctx.fillStyle = `hsl(${placeholderHue(normalize(title))} 45% 40%)`
  ctx.fillRect(0, 0, COVER_W, COVER_H)

  ctx.textBaseline = 'top'
  ctx.fillStyle = '#fff'
  ctx.font = TITLE_FONT
  const titleLines = wrapLines(ctx, title, TEXT_W, TITLE_MAX_LINES)
  titleLines.forEach((line, i) => ctx.fillText(line, PAD, TITLE_TOP + i * TITLE_LINE_H))

  if (author.trim()) {
    ctx.font = AUTHOR_FONT
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    const authorTop = TITLE_TOP + titleLines.length * TITLE_LINE_H + AUTHOR_GAP
    const authorLines = wrapLines(ctx, author, TEXT_W, AUTHOR_MAX_LINES)
    authorLines.forEach((line, i) => ctx.fillText(line, PAD, authorTop + i * AUTHOR_LINE_H))
  }

  return toBlob(canvas)
}

/** Cover → toCoverJpeg; a null cover or any failure while converting falls back to generateCover. */
export async function makeCover(
  cover: Blob | null,
  title: string,
  author: string,
  deps: CoverDeps = {},
): Promise<{ blob: Blob; generated: boolean }> {
  if (cover) {
    try {
      return { blob: await toCoverJpeg(cover, deps), generated: false }
    } catch {
      // fall through to the generated cover
    }
  }
  return { blob: await generateCover(title, author, deps), generated: true }
}
