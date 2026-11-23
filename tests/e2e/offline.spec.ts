import { test, expect } from '@playwright/test'
import { mockDrive } from './drive-mock'
import { bookCard, marker, openFromLibrary, waitForReady } from './reader-helpers'

const CACHED = { id: 'a', name: 'Sách Mẫu.epub', fixture: 'book-v1.epub' }
const UNCACHED = { id: 'u', name: 'Truyện Khác.epub', fixture: 'book-v1.epub' }
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
  await mockDrive(context, [CACHED])
  await openFromLibrary(page, bookCard(page), CACHED.id)
  await expect.poll(() => marker(page)).toMatchObject({ chapter: 1 })
  await page.evaluate(() => navigator.serviceWorker.ready)

  await context.setOffline(true)
  await page.reload()
  await expect(page).toHaveURL(/#\/read\/a$/)
  await waitForReady(page)
  await expect.poll(() => marker(page)).toMatchObject({ chapter: 1 })
})

test('cache.fetch.offline: an uncached book shows the offline message and makes no media request', async ({ page, context }) => {
  const drive = await mockDrive(context, [CACHED, UNCACHED])
  await page.goto('./')
  const card = bookCard(page, 'Truyện Khác')
  await expect(card).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => navigator.serviceWorker.ready)
  const mediaBefore = drive.mediaRequests(UNCACHED.id)
  const requestsBefore = drive.requests.length

  await context.setOffline(true)
  await page.evaluate(() => {
    location.hash = '#/read/u'
  })
  await expect(page).toHaveURL(/#\/read\/u$/)
  await expect(page.getByText(OFFLINE_MESSAGE, { exact: true })).toBeVisible()
  expect(drive.mediaRequests(UNCACHED.id)).toBe(mediaBefore)
  expect(drive.requests.length).toBe(requestsBefore)
})
