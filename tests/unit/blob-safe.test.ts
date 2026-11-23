import { describe, it, expect } from 'vitest'
import { toBytesIfMarkup, installBlobSafeTransform } from '../../src/reader/blob-safe'

const decode = (bytes: unknown) => new TextDecoder().decode(bytes as Uint8Array)
const isBytes = (v: unknown) => Object.prototype.toString.call(v) === '[object Uint8Array]'

describe('blob-safe', () => {
  const xhtml = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Chương 1: Đấu Phá Thương Khung</p></body></html>'

  it('converts a string with application/xhtml+xml into bytes that decode back to the same string', async () => {
    const out = await toBytesIfMarkup(xhtml, 'application/xhtml+xml')
    expect(isBytes(out)).toBe(true)
    expect(decode(out)).toBe(xhtml)
  })

  it.each(['text/html', 'text/xml', 'application/xml', 'image/svg+xml'])('converts a string with %s', async (type) => {
    const out = await toBytesIfMarkup('<p>Xin chào</p>', type)
    expect(decode(out)).toBe('<p>Xin chào</p>')
  })

  it('matches the MIME type case-insensitively', async () => {
    const out = await toBytesIfMarkup('<p>Xin chào</p>', 'TEXT/HTML')
    expect(isBytes(out)).toBe(true)
    expect(decode(out)).toBe('<p>Xin chào</p>')
  })

  it('keeps a string with text/css unchanged', async () => {
    expect(await toBytesIfMarkup('p { color: red }', 'text/css')).toBe('p { color: red }')
  })

  it('keeps a Blob unchanged', async () => {
    const blob = new Blob(['<p>x</p>'], { type: 'application/xhtml+xml' })
    expect(await toBytesIfMarkup(blob, 'application/xhtml+xml')).toBe(blob)
  })

  it('propagates a rejected data Promise unchanged', async () => {
    const err = new Error('boom')
    await expect(toBytesIfMarkup(Promise.reject(err), 'application/xhtml+xml')).rejects.toBe(err)
  })

  it('awaits a Promise for data and type', async () => {
    const out = await toBytesIfMarkup(Promise.resolve('<p>a</p>'), Promise.resolve('text/html'))
    expect(decode(out)).toBe('<p>a</p>')
  })

  describe('installBlobSafeTransform', () => {
    it('rewrites markup data on dispatched data events, and stops after the returned release is called', async () => {
      const target = new EventTarget()
      const release = installBlobSafeTransform(target)

      const detail = { data: xhtml as unknown, type: 'application/xhtml+xml' }
      target.dispatchEvent(new CustomEvent('data', { detail }))
      const out = await detail.data
      expect(isBytes(out)).toBe(true)
      expect(decode(out)).toBe(xhtml)

      release()

      const after = { data: xhtml as unknown, type: 'application/xhtml+xml' }
      target.dispatchEvent(new CustomEvent('data', { detail: after }))
      expect(after.data).toBe(xhtml)
    })

    it('leaves non-markup data events unchanged', async () => {
      const target = new EventTarget()
      installBlobSafeTransform(target)
      const detail = { data: 'body {}' as unknown, type: 'text/css' }
      target.dispatchEvent(new CustomEvent('data', { detail }))
      expect(await detail.data).toBe('body {}')
    })
  })
})
