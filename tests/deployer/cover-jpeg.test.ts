import { describe, expect, it, vi } from 'vitest'
import {
  generateCover,
  makeCover,
  targetSize,
  toCoverJpeg,
  wrapLines,
  type CoverDeps,
  type Canvasish,
} from '../../deployer/src/cover-jpeg'
import { placeholderHue } from '../../src/ui/library/CoverImage'
import { normalize } from '../../src/domain/title'

interface Call {
  name: string
  args: unknown[]
  fillStyle: string
}

class FakeCtx {
  fillStyle = ''
  font = ''
  textBaseline = ''
  calls: Call[] = []

  fillRect(...args: unknown[]) {
    this.calls.push({ name: 'fillRect', args, fillStyle: this.fillStyle })
  }
  drawImage(...args: unknown[]) {
    this.calls.push({ name: 'drawImage', args, fillStyle: this.fillStyle })
  }
  fillText(...args: unknown[]) {
    this.calls.push({ name: 'fillText', args, fillStyle: this.fillStyle })
  }
  measureText(text: string) {
    return { width: text.length * 10 }
  }
  of(name: string) {
    return this.calls.filter((c) => c.name === name)
  }
}

class FakeCanvas {
  ctx = new FakeCtx()
  toBlobCalls: { type: string; q: number }[] = []
  width: number
  height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
  getContext(_t: '2d') {
    return this.ctx as unknown as CanvasRenderingContext2D
  }
  toBlob(cb: (b: Blob | null) => void, type: string, q: number) {
    this.toBlobCalls.push({ type, q })
    cb(new Blob(['jpeg-bytes'], { type }))
  }
}

function setup(image: { width: number; height: number } | 'fail' = { width: 1200, height: 1800 }) {
  const canvases: FakeCanvas[] = []
  const close = vi.fn()
  const deps: CoverDeps = {
    createCanvas: (w, h) => {
      const c = new FakeCanvas(w, h)
      canvases.push(c)
      return c as unknown as Canvasish
    },
    loadImage: async () => {
      if (image === 'fail') throw new Error('decode failed')
      return { width: image.width, height: image.height, source: {} as CanvasImageSource, close }
    },
  }
  return { deps, canvases, close }
}

describe('deployer.cover.resize', () => {
  it('deployer.cover.resize: 1200x1800 cover becomes a 600x900 JPEG', async () => {
    const { deps, canvases } = setup({ width: 1200, height: 1800 })
    const blob = await toCoverJpeg(new Blob(['png'], { type: 'image/png' }), deps)

    expect(canvases).toHaveLength(1)
    expect(canvases[0].width).toBe(600)
    expect(canvases[0].height).toBe(900)
    expect(blob.type).toBe('image/jpeg')
  })

  it('deployer.cover.resize: fills white first, draws scaled to 600x900, encodes image/jpeg at q 0.85', async () => {
    const { deps, canvases } = setup({ width: 1200, height: 1800 })
    await toCoverJpeg(new Blob(['png'], { type: 'image/png' }), deps)
    const canvas = canvases[0]

    const fill = canvas.ctx.of('fillRect')
    expect(fill).toHaveLength(1)
    expect(fill[0].args).toEqual([0, 0, 600, 900])
    expect(fill[0].fillStyle).toBe('#fff')

    const draw = canvas.ctx.of('drawImage')
    expect(draw).toHaveLength(1)
    expect(draw[0].args.slice(1)).toEqual([0, 0, 600, 900])
    expect(canvas.ctx.calls.indexOf(fill[0])).toBeLessThan(canvas.ctx.calls.indexOf(draw[0]))

    expect(canvas.toBlobCalls).toEqual([{ type: 'image/jpeg', q: 0.85 }])
  })

  it('deployer.cover.resize: small 300x450 image is not upscaled', async () => {
    const { deps, canvases } = setup({ width: 300, height: 450 })
    await toCoverJpeg(new Blob(['png'], { type: 'image/png' }), deps)

    expect(canvases[0].width).toBe(300)
    expect(canvases[0].height).toBe(450)
    expect(canvases[0].ctx.of('drawImage')[0].args.slice(1)).toEqual([0, 0, 300, 450])
  })

  it('deployer.cover.resize: targetSize keeps aspect, never upscales, rounds', () => {
    expect(targetSize(1200, 1800)).toEqual({ width: 600, height: 900 })
    expect(targetSize(300, 450)).toEqual({ width: 300, height: 450 })
    expect(targetSize(1000, 1501)).toEqual({ width: 600, height: 901 })
  })
})

describe('deployer.cover.generated', () => {
  it('deployer.cover.generated: null cover yields a 600x900 canvas showing the title, generated true', async () => {
    const { deps, canvases } = setup()
    const { blob, generated } = await makeCover(null, 'Phàm Nhân Tu Tiên', 'Vong Ngữ', deps)

    expect(generated).toBe(true)
    expect(blob.type).toBe('image/jpeg')
    expect(canvases).toHaveLength(1)
    expect(canvases[0].width).toBe(600)
    expect(canvases[0].height).toBe(900)

    const texts = canvases[0].ctx.of('fillText').map((c) => c.args[0])
    expect(texts).toContain('Phàm Nhân Tu Tiên')
    expect(texts).toContain('Vong Ngữ')
    expect(canvases[0].toBlobCalls).toEqual([{ type: 'image/jpeg', q: 0.85 }])
  })

  it('deployer.cover.generated: background uses placeholderHue of the normalised title', async () => {
    const { deps, canvases } = setup()
    await generateCover('Phàm Nhân Tu Tiên', 'Vong Ngữ', deps)

    const hue = placeholderHue(normalize('Phàm Nhân Tu Tiên'))
    const fill = canvases[0].ctx.of('fillRect')
    expect(fill[0].args).toEqual([0, 0, 600, 900])
    expect(fill[0].fillStyle).toBe(`hsl(${hue} 45% 40%)`)
  })

  it('deployer.cover.generated: loadImage failure falls back to a generated cover', async () => {
    const { deps, canvases } = setup('fail')
    const { blob, generated } = await makeCover(
      new Blob(['broken'], { type: 'image/png' }),
      'Đấu Phá',
      'Thiên Tàm',
      deps,
    )

    expect(generated).toBe(true)
    expect(blob.type).toBe('image/jpeg')
    expect(canvases[0].width).toBe(600)
    expect(canvases[0].height).toBe(900)
    expect(canvases[0].ctx.of('fillText').map((c) => c.args[0])).toContain('Đấu Phá')
  })

  it('deployer.cover.generated: a real cover is used as-is with generated false', async () => {
    const { deps, canvases } = setup({ width: 1200, height: 1800 })
    const { generated } = await makeCover(new Blob(['png'], { type: 'image/png' }), 'A', 'B', deps)

    expect(generated).toBe(false)
    expect(canvases).toHaveLength(1)
    expect(canvases[0].ctx.of('drawImage')).toHaveLength(1)
  })

  it('deployer.cover.generated: wrapLines wraps words and truncates the last line with an ellipsis', () => {
    // measureText width = 10 px per character
    const ctx = { measureText: (t: string) => ({ width: t.length * 10 }) } as unknown as CanvasRenderingContext2D

    // greedy wrap, no truncation needed
    expect(wrapLines(ctx, 'ab cd ef', 50, 5)).toEqual(['ab cd', 'ef'])
    expect(wrapLines(ctx, 'ab cd ef gh', 50, 2)).toEqual(['ab cd', 'ef gh'])
    // truncated: only maxLines lines, last one ends with '…' and fits maxWidth
    expect(wrapLines(ctx, 'ab cd ef gh', 50, 1)).toEqual(['ab…'])
    expect(wrapLines(ctx, 'one two three four five six seven', 60, 2)).toEqual(['one', 'two…'])
    expect(wrapLines(ctx, '', 60, 2)).toEqual([])
  })
})
