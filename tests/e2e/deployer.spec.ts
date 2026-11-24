import { fileURLToPath } from 'node:url'
import { expect, test, type Page, type Route } from '@playwright/test'

/** Local deployer (vite.deployer.config.ts), not the PWA on 4173. */
const DEPLOYER = 'http://localhost:5174/'
const DEPLOYER_ORIGIN = 'http://localhost:5174'
const R2 = 'https://r2.test'
const TOKEN = 'test-token'
const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url))
const META_EPUB = `${FIXTURES}book-meta.epub` // title "Phàm Nhân Tu Tiên", subject "Tiên Hiệp"
const NOCOVER_EPUB = `${FIXTURES}book-nocover.epub` // title "Sách Mẫu", no cover

const CORS = {
  'Access-Control-Allow-Origin': DEPLOYER_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
  'Access-Control-Expose-Headers': 'ETag',
  'Access-Control-Max-Age': '600',
}

interface StoredObject {
  body: Buffer
  contentType: string
  etag: string
}

export interface FakeR2 {
  /** Keys in the order they were PUT. */
  readonly putKeys: string[]
  /** Parsed catalog.json, or null when it does not exist yet. */
  catalog(): { books: { id: string; title: string }[] } | null
}

/**
 * Mock of the R2 Worker on https://r2.test: an in-memory object map behind the admin routes
 * (Bearer auth, PUT/DELETE, list) and the public GETs. Answers CORS for the deployer origin.
 */
async function mockWorker(page: Page): Promise<FakeR2> {
  const objects = new Map<string, StoredObject>()
  const putKeys: string[] = []
  let version = 0

  const reply = (route: Route, status: number, body?: unknown, headers: Record<string, string> = {}) =>
    route.fulfill({
      status,
      headers: { ...CORS, ...headers },
      ...(body === undefined ? {} : { contentType: 'application/json', body: JSON.stringify(body) }),
    })

  await page.route(`${R2}/**`, async (route, request) => {
    const method = request.method()
    const url = new URL(request.url())
    const path = url.pathname

    if (method === 'OPTIONS') return reply(route, 204)

    if (path.startsWith('/admin/')) {
      if (request.headers()['authorization'] !== `Bearer ${TOKEN}`) return reply(route, 401, { error: 'unauthorized' })
      if (method === 'GET' && path === '/admin/list') {
        const prefix = url.searchParams.get('prefix') ?? ''
        const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort()
        return reply(route, 200, { objects: keys.map((key) => ({ key })) })
      }
      const key = decodeURIComponent(path.slice('/admin/'.length))
      if (method === 'PUT') {
        const ifMatch = request.headers()['if-match']
        if (ifMatch !== undefined && ifMatch !== objects.get(key)?.etag) return reply(route, 412, { error: 'precondition' })
        const body = request.postDataBuffer() ?? Buffer.alloc(0)
        const etag = `"v${++version}"`
        objects.set(key, { body, contentType: request.headers()['content-type'] ?? 'application/octet-stream', etag })
        putKeys.push(key)
        return reply(route, 200, { key, etag, size: body.length })
      }
      if (method === 'DELETE') {
        objects.delete(key)
        return reply(route, 204)
      }
      return reply(route, 405, { error: 'method' })
    }

    if (method === 'GET') {
      const obj = objects.get(decodeURIComponent(path.slice(1)))
      if (obj === undefined) return reply(route, 404)
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'Content-Type': obj.contentType, ETag: obj.etag },
        body: obj.body,
      })
    }
    return reply(route, 405)
  })

  return {
    putKeys,
    catalog() {
      const raw = objects.get('catalog.json')
      return raw === undefined ? null : (JSON.parse(raw.body.toString('utf-8')) as { books: { id: string; title: string }[] })
    },
  }
}

async function openConnected(page: Page): Promise<void> {
  await page.goto(DEPLOYER)
  await page.getByLabel('Địa chỉ Worker').fill(R2)
  await page.getByLabel('Mã quản trị').fill(TOKEN)
  await page.getByRole('button', { name: 'Kết nối' }).click()
  await expect(page.getByText('Đã kết nối · 0 truyện')).toBeVisible()
}

async function pickTwoBooks(page: Page): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles([META_EPUB, NOCOVER_EPUB])
  await expect(page.getByRole('article')).toHaveCount(2)
}

test.describe('deployer', () => {
  test('deployer.upload.layout: two EPUBs upload as epub, cover, metadata, then catalog, and show under "Đã đăng"', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the upload runs once, on the desktop project')
    const r2 = await mockWorker(page)
    await openConnected(page)

    await pickTwoBooks(page)
    const pham = page.getByRole('article', { name: 'Phàm Nhân Tu Tiên' })
    await expect(pham.getByText('pham-nhan-tu-tien/', { exact: false })).toBeVisible()
    // The fields fold away until "Sửa thông tin" is opened.
    await pham.getByText('Sửa thông tin').click()
    await expect(pham.getByLabel('Thư mục (slug)')).toHaveValue('pham-nhan-tu-tien')
    await expect(pham.getByRole('button', { name: 'Tiên hiệp' })).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Tải lên 2 truyện' }).click()
    await expect(page.getByText('Đã tải lên', { exact: true })).toHaveCount(2)

    expect(r2.putKeys).toEqual([
      'books/pham-nhan-tu-tien/pham-nhan-tu-tien.epub',
      'books/pham-nhan-tu-tien/cover.jpg',
      'books/pham-nhan-tu-tien/metadata.json',
      'catalog.json',
      'books/sach-mau/sach-mau.epub',
      'books/sach-mau/cover.jpg',
      'books/sach-mau/metadata.json',
      'catalog.json',
    ])
    expect(r2.catalog()?.books.map((b) => b.id)).toEqual(['pham-nhan-tu-tien', 'sach-mau'])

    await page.getByRole('tab', { name: 'Đã đăng' }).click()
    await expect(page.getByText('Đã đăng · 2 truyện')).toBeVisible()
    await expect(page.getByText('Phàm Nhân Tu Tiên', { exact: true })).toBeVisible()
    await expect(page.getByText('Sách Mẫu', { exact: true })).toBeVisible()
  })

  test('deployer.layout.narrow: at 375 px the cards stack one per row with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(DEPLOYER)
    await pickTwoBooks(page)

    const first = await page.getByRole('article', { name: 'Phàm Nhân Tu Tiên' }).boundingBox()
    const second = await page.getByRole('article', { name: 'Sách Mẫu' }).boundingBox()
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height)

    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
  })

  test('deployer.layout.wide: at 1280 px the cards sit side by side, right of the connect panel', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(DEPLOYER)
    await pickTwoBooks(page)

    const connect = await page.locator('section[aria-labelledby="connect-heading"]').boundingBox()
    const first = await page.getByRole('article', { name: 'Phàm Nhân Tu Tiên' }).boundingBox()
    const second = await page.getByRole('article', { name: 'Sách Mẫu' }).boundingBox()
    expect(connect).not.toBeNull()
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(Math.abs(second!.y - first!.y)).toBeLessThan(1)
    expect(second!.x).toBeGreaterThan(first!.x + first!.width - 1)
    expect(connect!.x + connect!.width).toBeLessThanOrEqual(first!.x)
  })
})
