type AnyCanvas = OffscreenCanvas | HTMLCanvasElement

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  return Object.assign(document.createElement('canvas'), { width: w, height: h })
}

function encode(canvas: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality })
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      type,
      quality,
    )
  })
}

/**
 * Shrinks an image to at most `maxWidth` px wide (aspect kept), re-encoded as
 * WebP, falling back to JPEG when the browser cannot encode WebP. Any failure,
 * or an image already small enough, returns the original blob.
 */
export async function downscale(blob: Blob, maxWidth = 320): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob)
    try {
      if (bmp.width <= maxWidth) return blob
      const w = maxWidth
      const h = Math.round((bmp.height * maxWidth) / bmp.width)
      const canvas = makeCanvas(w, h)
      const ctx = canvas.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null
      if (!ctx) return blob
      ctx.drawImage(bmp, 0, 0, w, h)
      let out = await encode(canvas, 'image/webp', 0.8)
      if (out.type !== 'image/webp') out = await encode(canvas, 'image/jpeg', 0.85)
      return out
    } finally {
      bmp.close?.()
    }
  } catch {
    return blob
  }
}
