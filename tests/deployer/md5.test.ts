// @vitest-environment jsdom
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { md5Hex } from '../../deployer/src/md5'

const fixtures = resolve(__dirname, '../fixtures') + '/'

const nodeMd5 = (bytes: Uint8Array) => createHash('md5').update(bytes).digest('hex')

describe('deployer.md5', () => {
  it('md5.hash: matches node md5 of book-v1.epub', async () => {
    const bytes = readFileSync(`${fixtures}book-v1.epub`)
    const blob = new Blob([new Uint8Array(bytes)])
    expect(await md5Hex(blob)).toBe(nodeMd5(new Uint8Array(bytes)))
  })

  it('md5.hash: empty blob gives the md5 of no bytes', async () => {
    expect(await md5Hex(new Blob([]))).toBe('d41d8cd98f00b204e9800998ecf8427e')
  })

  it('md5.hash: multi-chunk blob (5 MB) matches node md5', async () => {
    const bytes = new Uint8Array(randomBytes(5 * 1024 * 1024))
    expect(await md5Hex(new Blob([bytes]))).toBe(nodeMd5(bytes))
  })

  it('md5.progress: reports done/total and ends at total', async () => {
    const bytes = new Uint8Array(randomBytes(5 * 1024 * 1024))
    const calls: Array<[number, number]> = []
    await md5Hex(new Blob([bytes]), (done, total) => calls.push([done, total]))
    expect(calls.length).toBeGreaterThan(1)
    for (const [, total] of calls) expect(total).toBe(bytes.length)
    for (let i = 1; i < calls.length; i++) expect(calls[i][0]).toBeGreaterThanOrEqual(calls[i - 1][0])
    expect(calls[calls.length - 1][0]).toBe(bytes.length)
  })
})
