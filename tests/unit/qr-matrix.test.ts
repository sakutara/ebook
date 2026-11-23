import { describe, it, expect } from 'vitest'
import { qrMatrix, qrSvg } from '../../src/donate/qr-matrix'

const PAYLOAD =
  '00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA53037045405200005802VN62280824donate token dich truyen6304ABCD'

function countDark(m: boolean[][]): number {
  return m.reduce((acc, row) => acc + row.filter(Boolean).length, 0)
}

describe('donate.qr.offline: qrMatrix', () => {
  it('donate.qr.offline: returns a square matrix of size 17 + 4·version', () => {
    const m = qrMatrix(PAYLOAD)
    const n = m.length
    expect(n).toBeGreaterThanOrEqual(21)
    expect((n - 17) % 4).toBe(0)
    for (const row of m) expect(row.length).toBe(n)
  })

  it('donate.qr.offline: top-left 7x7 finder pattern is correct', () => {
    const m = qrMatrix(PAYLOAD)
    // row 0, cols 0..6 all dark
    for (let c = 0; c <= 6; c++) expect(m[0][c], `r0c${c}`).toBe(true)
    // row 1, cols 1..5 light (inner ring)
    for (let c = 1; c <= 5; c++) expect(m[1][c], `r1c${c}`).toBe(false)
    // rows 0 and 6 edges dark, row 6 cols 0..6 dark
    expect(m[1][0]).toBe(true)
    expect(m[1][6]).toBe(true)
    for (let c = 0; c <= 6; c++) expect(m[6][c], `r6c${c}`).toBe(true)
  })

  it('donate.qr.offline: is deterministic for the same payload', () => {
    expect(qrMatrix(PAYLOAD)).toEqual(qrMatrix(PAYLOAD))
  })

  it('donate.qr.offline: different payloads produce different matrices', () => {
    expect(qrMatrix(PAYLOAD)).not.toEqual(qrMatrix(PAYLOAD + 'X'))
  })
})

describe('donate.qr.offline: qrSvg', () => {
  it('donate.qr.offline: returns a single svg element with the quiet-zone viewBox', () => {
    const n = qrMatrix(PAYLOAD).length
    const svg = qrSvg(PAYLOAD)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain(`viewBox="0 0 ${n + 8} ${n + 8}"`)
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).toContain('fill="currentColor"')
  })

  it('donate.qr.offline: contains exactly one path and no script', () => {
    const svg = qrSvg(PAYLOAD)
    expect(svg.match(/<path/g)?.length).toBe(1)
    expect(svg).not.toContain('<script')
  })

  it('donate.qr.offline: emits one unit square run per dark module, offset by the 4-module quiet zone', () => {
    const m = qrMatrix(PAYLOAD)
    const svg = qrSvg(PAYLOAD)
    const runs = [...svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((x) => [Number(x[1]), Number(x[2])])
    expect(runs.length).toBe(countDark(m))

    const expected: Array<[number, number]> = []
    m.forEach((row, r) =>
      row.forEach((dark, c) => {
        if (dark) expected.push([c + 4, r + 4])
      }),
    )
    expect(runs).toEqual(expected)
  })

  it('donate.qr.offline: svg output is stable for the same input', () => {
    expect(qrSvg(PAYLOAD)).toBe(qrSvg(PAYLOAD))
  })
})
