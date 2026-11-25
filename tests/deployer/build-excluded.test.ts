// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

describe('deployer.build.excluded', () => {
  it('deployer.build.excluded: deployer page exists as its own entry with its own config', () => {
    expect(existsSync(join(root, 'deployer/index.html'))).toBe(true)
    expect(readFileSync(join(root, 'deployer/index.html'), 'utf-8')).toContain('<title>Fiddle Book Deployer</title>')
    expect(existsSync(join(root, 'vite.deployer.config.ts'))).toBe(true)
  })

  it('deployer.build.excluded: main vite config does not add deployer to rollup input', () => {
    const src = readFileSync(join(root, 'vite.config.ts'), 'utf-8')
    expect(src).not.toMatch(/rollupOptions[\s\S]*?input[\s\S]*?deployer/)
  })

  it('deployer.build.excluded: dist/ contains no deployer page', () => {
    const dist = join(root, 'dist')
    if (!existsSync(dist)) return
    const offenders = listFiles(dist).filter((file) => readFileSync(file).includes('Fiddle Book Deployer'))
    expect(offenders).toEqual([])
  })
})
