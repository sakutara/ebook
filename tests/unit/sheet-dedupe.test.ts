import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalize } from '../../src/domain/title'

const SRC_PATH = resolve(process.cwd(), 'scripts/apps-script/dedupe-requests.gs')
const src = readFileSync(SRC_PATH, 'utf8')

interface FakeRange {
  getValues(): unknown[][]
}

interface FakeSheet {
  deleted: number[]
  getLastRow(): number
  getLastColumn(): number
  getRange(row: number, col: number, numRows: number, numCols: number): FakeRange
  deleteRow(row: number): void
}

/** Sheet with header in row 1 and data starting at row 2. `titles` are the title column (col 2). */
function makeSheet(titles: string[]): FakeSheet {
  const rows: unknown[][] = [
    ['Dấu thời gian', 'Tên truyện'],
    ...titles.map((t, i) => [`2026-01-0${i + 1}`, t]),
  ]
  const sheet: FakeSheet = {
    deleted: [],
    getLastRow: () => rows.length,
    getLastColumn: () => rows[0].length,
    getRange(row, col, numRows, numCols) {
      return {
        getValues: () =>
          rows
            .slice(row - 1, row - 1 + numRows)
            .map((r) => r.slice(col - 1, col - 1 + numCols)),
      }
    },
    deleteRow(row: number) {
      sheet.deleted.push(row)
    },
  }
  return sheet
}

interface Fakes {
  lock: { waits: number[]; releases: number }
  activeSheets: FakeSheet[]
  mod: { exports?: Record<string, unknown> }
  SpreadsheetApp: { getActiveSpreadsheet(): { getSheets(): FakeSheet[] } }
  LockService: { getScriptLock(): { waitLock(ms: number): void; releaseLock(): void } }
}

function load(activeSheets: FakeSheet[] = []): Fakes {
  const fakes: Fakes = {
    lock: { waits: [], releases: 0 },
    activeSheets,
    mod: {},
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheets: () => fakes.activeSheets }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: (ms: number) => {
          fakes.lock.waits.push(ms)
        },
        releaseLock: () => {
          fakes.lock.releases += 1
        },
      }),
    },
  }
  new Function('module', 'SpreadsheetApp', 'LockService', src)(
    fakes.mod,
    fakes.SpreadsheetApp,
    fakes.LockService,
  )
  return fakes
}

function api(f: Fakes) {
  return f.mod.exports as {
    normalizeTitle(s: string): string
    duplicateRowIndexes(titles: string[]): number[]
    findTitleColumn(sheet: FakeSheet): number
    onFormSubmit(e: { range: { getRow(): number; getSheet?(): FakeSheet } }): void
    dedupeAll(): void
  }
}

describe('sheet-dedupe (Apps Script)', () => {
  it('story-request.sheet.dedupe-new: normalizeTitle matches src normalize', () => {
    const { normalizeTitle } = api(load())
    for (const s of ['Phàm Nhân Tu Tiên!', 'Đấu  Phá', '']) {
      expect(normalizeTitle(s)).toBe(normalize(s))
    }
    expect(normalizeTitle('Phàm Nhân Tu Tiên!')).toBe('pham nhan tu tien')
    expect(normalizeTitle('Đấu  Phá')).toBe('dau pha')
  })

  it('story-request.sheet.dedupe-helpers: duplicateRowIndexes flags empty and repeated titles', () => {
    const { duplicateRowIndexes } = api(load())
    expect(duplicateRowIndexes(['A', 'B', 'a', '', 'b!', 'C'])).toEqual([2, 3, 4])
  })

  it('story-request.sheet.dedupe-new: onFormSubmit deletes the new row when its title is a duplicate', () => {
    const sheet = makeSheet(['Phàm Nhân Tu Tiên', 'X', 'Y', 'pham nhan tu tien!'])
    const f = load([sheet])
    api(f).onFormSubmit({ range: { getRow: () => 5, getSheet: () => sheet } })
    expect(sheet.deleted).toEqual([5])
    expect(f.lock.waits).toEqual([30000])
    expect(f.lock.releases).toBe(1)
  })

  it('story-request.sheet.dedupe-new: onFormSubmit keeps a unique new row', () => {
    const sheet = makeSheet(['Phàm Nhân Tu Tiên', 'X', 'Y', 'Đấu Phá'])
    const f = load([sheet])
    api(f).onFormSubmit({ range: { getRow: () => 5, getSheet: () => sheet } })
    expect(sheet.deleted).toEqual([])
    expect(f.lock.releases).toBe(1)
  })

  it('story-request.sheet.dedupe-new: onFormSubmit falls back to the first active sheet without e.range.getSheet', () => {
    const sheet = makeSheet(['A', 'a'])
    const f = load([sheet])
    api(f).onFormSubmit({ range: { getRow: () => 3 } })
    expect(sheet.deleted).toEqual([3])
  })

  it('story-request.sheet.dedupe-all: dedupeAll deletes duplicate rows bottom-up and keeps A, B, C', () => {
    const sheet = makeSheet(['A', 'B', 'a', '', 'b!', 'C'])
    const f = load([sheet])
    api(f).dedupeAll()
    expect(sheet.deleted).toEqual([6, 5, 4])
    expect(f.lock.waits).toEqual([30000])
    expect(f.lock.releases).toBe(1)
  })
})
