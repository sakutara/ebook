import { test, expect } from '@playwright/test'
import { epubPath, mockR2 } from './r2-mock'
import { bookCard, marker, openFromLibrary, waitForReady } from './reader-helpers'

const CACHED = { id: 'sach-mau', title: 'Sách Mẫu', fixture: 'book-v1.epub' }
const UNCACHED = { id: 'truyen-khac', title: 'Truyện Khác', fixture: 'book-v1.epub' }
const OFFLINE_MESSAGE = 'Cần kết nối mạng để tải truyện này lần đầu'

test('app-shell.offline.reload: shell renders offline after first visit', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Sync status' })).toContainText('Ngoại tuyến')
})

test('app-shell.layout.narrow / app-shell.layout.wide: bottom tabs on mobile, side nav on desktop, no horizontal scroll', async ({ page }, info) => {
  await page.goto('./')
  const tabs = page.getByRole('navigation', { name: 'Thanh điều hướng' })
  const side = page.getByRole('navigation', { name: 'Điều hướng chính' })
  if (info.project.name === 'mobile') { await expect(tabs).toBeVisible(); await expect(side).toBeHidden() }
  else { await expect(side).toBeVisible(); await expect(tabs).toBeHidden() }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('app-shell.offline.reload: a cached book still renders after a reload with the network down', async ({ page, context }) => {
  await mockR2(context, { books: [CACHED] })
  await openFromLibrary(page, bookCard(page), CACHED.id)
  await expect.poll(() => marker(page)).toMatchObject({ chapter: 1 })
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)
  await page.reload()
  await expect(page).toHaveURL(/#\/read\/sach-mau$/)
  await waitForReady(page)
  await expect.poll(() => marker(page)).toMatchObject({ chapter: 1 })
})

test('cache.fetch.offline: an uncached book shows the offline message and makes no media request', async ({ page, context }) => {
  const r2 = await mockR2(context, { books: [CACHED, UNCACHED] })
  await page.goto('./')
  const card = bookCard(page, 'Truyện Khác')
  await expect(card).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => navigator.serviceWorker.ready)
  const epubBefore = r2.count(epubPath(UNCACHED.id))
  const requestsBefore = r2.requests.length

  await context.setOffline(true)
  await page.evaluate(() => {
    location.hash = '#/read/truyen-khac'
  })
  await expect(page).toHaveURL(/#\/read\/truyen-khac$/)
  await expect(page.getByText(OFFLINE_MESSAGE, { exact: true })).toBeVisible()
  expect(r2.count(epubPath(UNCACHED.id))).toBe(epubBefore)
  expect(r2.requests.length).toBe(requestsBefore)
})

test('catalog.sync.resync: a device that started offline syncs on the online event and shows new books', async ({ page, context }) => {
  const NEW = { id: 'truyen-moi', title: 'Truyện Mới', fixture: 'book-v1.epub' }
  const r2 = await mockR2(context, { books: [CACHED] })
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect(bookCard(page)).toBeVisible()

  // Start offline: the stored catalog is shown and no sync request is made.
  await context.setOffline(true)
  await page.reload()
  await expect(bookCard(page)).toBeVisible()
  const catalogBefore = r2.count('/catalog.json')

  r2.setBooks([CACHED, NEW])
  await context.setOffline(false)
  await expect(bookCard(page, NEW.title)).toBeVisible()
  expect(r2.count('/catalog.json')).toBeGreaterThan(catalogBefore)
})
