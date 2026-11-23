import { test, expect } from '@playwright/test'
import { makeLibrary, mockDrive } from './drive-mock'

const DPK = 'Đấu Phá Thương Khung'
const SEARCH = 'Tìm truyện'
const TABS = 'Thanh điều hướng'
const SIDE = 'Điều hướng chính'

test('library.layout.narrow / library.layout.wide: grid columns, navigation and no horizontal scroll', async ({ page, context }, info) => {
  await mockDrive(context, makeLibrary(30))
  await page.goto('./')
  await expect(page.getByRole('article', { name: DPK })).toBeVisible()

  const columns = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('article')].map((a) => a.getBoundingClientRect())
    const firstTop = rects[0].top
    return new Set(rects.filter((r) => Math.abs(r.top - firstTop) < 2).map((r) => Math.round(r.left))).size
  })
  const narrow = info.project.name === 'mobile'
  if (narrow) expect(columns).toBe(2)
  else expect(columns).toBeGreaterThanOrEqual(6)

  const tabs = page.getByRole('navigation', { name: TABS })
  const side = page.getByRole('navigation', { name: SIDE })
  if (narrow) {
    await expect(tabs).toBeVisible()
    await expect(side).toBeHidden()
  } else {
    await expect(side).toBeVisible()
    await expect(tabs).toBeHidden()
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('app-shell.routes.reader-fullscreen: reader hides navigation and back button restores the search query', async ({ page, context }) => {
  await mockDrive(context, makeLibrary(30))
  await page.goto('./')
  const search = page.getByRole('searchbox', { name: SEARCH })
  await search.fill('dau')
  const dpk = page.getByRole('article', { name: DPK })
  await expect(dpk).toBeVisible()

  await dpk.getByRole('button', { name: 'Đọc', exact: true }).click()
  await expect(page).toHaveURL(/#\/read\/dpk$/)
  await expect(page.getByRole('navigation', { name: TABS })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: SIDE })).toHaveCount(0)

  const back = page.getByRole('button', { name: 'Về thư viện' })
  if (!(await back.isVisible())) {
    const vp = page.viewportSize()
    if (!vp) throw new Error('viewport size unavailable')
    await page.mouse.click(vp.width / 2, vp.height / 2)
  }
  await back.click()

  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('searchbox', { name: SEARCH })).toHaveValue('dau')
  await expect(page.getByRole('article', { name: DPK })).toBeVisible()
})

test('app-shell.routes.reader-fullscreen: scroll position is kept when returning from the reader', async ({ page, context }) => {
  await mockDrive(context, makeLibrary(30))
  await page.goto('./')
  await expect(page.getByRole('article', { name: DPK })).toBeVisible()

  // The unfiltered list must be scrollable, otherwise the restore check would pass vacuously.
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 200))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(195)

  // Open a card that is already inside the viewport, so clicking does not scroll the page first.
  const visibleTitle = await page.evaluate(() => {
    const vh = window.innerHeight
    const card = [...document.querySelectorAll('article')].find((a) => {
      const r = a.getBoundingClientRect()
      return r.top > 0 && r.bottom < vh
    })
    return card?.getAttribute('aria-label') ?? null
  })
  if (!visibleTitle) throw new Error('no fully visible card to open')
  const card = page.getByRole('article', { name: visibleTitle, exact: true })
  await card.getByRole('button', { name: 'Đọc', exact: true }).click()
  await expect(page).toHaveURL(/#\/read\//)

  const back = page.getByRole('button', { name: 'Về thư viện' })
  if (!(await back.isVisible())) {
    const vp = page.viewportSize()
    if (!vp) throw new Error('viewport size unavailable')
    await page.mouse.click(vp.width / 2, vp.height / 2)
  }
  await back.click()
  await expect(page).toHaveURL(/#\/$/)

  // Cards render after the live queries load, so poll until the scroll restore settles.
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - 200))
    .toBeLessThanOrEqual(5)
})

test('library.search.offline: filters the local catalog with no Drive request', async ({ page, context }) => {
  const drive = await mockDrive(context, makeLibrary(30))
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect(page.getByRole('article', { name: DPK })).toBeVisible()
  await page.waitForLoadState('networkidle')
  const before = drive.requests.length

  await context.setOffline(true)
  await page.getByRole('searchbox', { name: SEARCH }).fill('dau pha')

  const articles = page.getByRole('article')
  await expect(articles).toHaveCount(1)
  await expect(page.getByRole('article', { name: DPK })).toBeVisible()
  expect(drive.requests.length).toBe(before)
})

test('library.cover.no-drive: the list shows file-name titles and never reads book bytes for covers', async ({ page, context }) => {
  const drive = await mockDrive(context, makeLibrary(30))
  await page.goto('./')
  const card = page.getByRole('article', { name: DPK })
  await expect(card).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect(card.locator('img')).toHaveCount(0)
  await expect(card.getByRole('img', { name: DPK })).toBeVisible()
  expect(drive.mediaRequests('dpk')).toBe(0)
})

test('library.cover.saved: the saved tab shows the cover from the cached file', async ({ page, context }) => {
  await mockDrive(context, makeLibrary(30))
  await page.goto('./')
  const card = page.getByRole('article', { name: DPK })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Đọc', exact: true }).click()
  await expect(page).toHaveURL(/#\/read\/dpk$/)
  await page.goto('./')

  await expect(page.getByRole('article', { name: DPK }).locator('img')).toHaveCount(0)
  await page.getByRole('radio', { name: 'Đã lưu', exact: true }).click()
  await expect(page.getByRole('article', { name: DPK }).locator('img')).toBeVisible({ timeout: 10_000 })
})
