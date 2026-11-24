import { tapRead } from './reader-helpers'
import { test, expect, type Locator, type Page } from '@playwright/test'
import { coverPath, epubPath, makeLibrary, mockR2 } from './r2-mock'

const DPK = 'Đấu Phá Thương Khung'
const DPK_ID = 'dau-pha-thuong-khung'
const SEARCH = 'Tìm truyện'
const TABS = 'Thanh điều hướng'
const SIDE = 'Điều hướng chính'
const TOOLBAR_GENRES = 'Thể loại'

function card(page: Page, title = DPK): Locator {
  return page.getByRole('article', { name: title })
}

/** Below xl the filters live in a drawer; open it when the toggle is shown. */
async function openFilters(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Mở bộ lọc' })
  if (await toggle.isVisible()) await toggle.click()
}

test('library.layout.narrow / library.layout.wide: grid columns, navigation, genre row and no horizontal scroll', async ({ page, context }, info) => {
  await mockR2(context, { books: makeLibrary(30) })
  await page.goto('./')
  await expect(card(page)).toBeVisible()

  const columns = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('article')].map((a) => a.getBoundingClientRect())
    const firstTop = rects[0].top
    return new Set(rects.filter((r) => Math.abs(r.top - firstTop) < 2).map((r) => Math.round(r.left))).size
  })
  const narrow = info.project.name === 'mobile'
  if (narrow) expect(columns).toBe(2)
  else expect(columns).toBeGreaterThanOrEqual(4)

  const tabs = page.getByRole('navigation', { name: TABS })
  const side = page.getByRole('navigation', { name: SIDE })
  const aside = page.getByRole('complementary', { name: 'Bộ lọc truyện' })
  if (narrow) {
    await expect(tabs).toBeVisible()
    await expect(side).toBeHidden()
    // The filters are a drawer at the right edge: hidden until the toggle is pressed.
    await expect(aside).toBeHidden()
    await page.getByRole('button', { name: 'Mở bộ lọc' }).click()
    await expect(aside).toBeVisible()
    const box = await aside.boundingBox()
    const vw = page.viewportSize()!.width
    if (!box) throw new Error('drawer has no bounding box')
    expect(Math.round(box.x + box.width), 'drawer is flush with the right edge').toBe(vw)
    await page.getByRole('button', { name: 'Đóng bộ lọc' }).click()
    await expect(aside).toBeHidden()
  } else {
    await expect(side).toBeVisible()
    await expect(tabs).toBeHidden()
    await expect(page.getByRole('button', { name: 'Mở bộ lọc' })).toBeHidden()
    // The panel is a column to the right of the grid, and genres are listed vertically.
    await expect(aside).toBeVisible()
    const panel = await aside.boundingBox()
    const first = await card(page).boundingBox()
    const genreRow = page.getByRole('radiogroup', { name: TOOLBAR_GENRES })
    const chips = await genreRow.getByRole('radio').all()
    if (!panel || !first) throw new Error('missing bounding box')
    expect(panel.x, 'filter panel sits right of the books').toBeGreaterThanOrEqual(first.x + first.width)
    expect(chips.length).toBeGreaterThan(1)
    const ys = await Promise.all(chips.map(async (c) => (await c.boundingBox())!.y))
    expect(ys.every((y, i) => i === 0 || y > ys[i - 1]), 'genres stack vertically').toBe(true)
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('app-shell.routes.reader-fullscreen: reader hides navigation and back button restores the search query', async ({ page, context }) => {
  await mockR2(context, { books: makeLibrary(30) })
  await page.goto('./')
  const search = page.getByRole('searchbox', { name: SEARCH })
  await search.fill('dau')
  const dpk = card(page)
  await expect(dpk).toBeVisible()

  await tapRead(page, dpk)
  await expect(page).toHaveURL(new RegExp(`#/read/${DPK_ID}$`))
  await expect(page.getByRole('navigation', { name: TABS })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: SIDE })).toHaveCount(0)

  const back = page.getByRole('button', { name: 'Về thư viện' })
  if (!(await back.isVisible())) {
    const vp = page.viewportSize()
    if (!vp) throw new Error('viewport size unavailable')
    await page.mouse.click(vp.width / 2, vp.height / 2)
  }
  await back.click()

  await expect(page).toHaveURL(/\/(#\/)?$/)
  await expect(page.getByRole('searchbox', { name: SEARCH })).toHaveValue('dau')
  await expect(card(page)).toBeVisible()
})

test('app-shell.routes.reader-fullscreen: scroll position is kept when returning from the reader', async ({ page, context }) => {
  await mockR2(context, { books: makeLibrary(30) })
  await page.goto('./')
  await expect(card(page)).toBeVisible()

  // The unfiltered list must be scrollable, otherwise the restore check would pass vacuously.
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true)
  await page.evaluate(() => window.scrollTo(0, 200))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(195)

  // Open a card that is already inside the viewport, so clicking does not scroll the page first.
  const visibleTitle = await page.evaluate(() => {
    const vh = window.innerHeight
    const found = [...document.querySelectorAll('article')].find((a) => {
      const r = a.getBoundingClientRect()
      return r.top > 0 && r.bottom < vh
    })
    return found?.getAttribute('aria-label') ?? null
  })
  if (!visibleTitle) throw new Error('no fully visible card to open')
  const visible = page.getByRole('article', { name: visibleTitle, exact: true })
  await tapRead(page, visible)
  await expect(page).toHaveURL(/#\/read\//)

  const back = page.getByRole('button', { name: 'Về thư viện' })
  if (!(await back.isVisible())) {
    const vp = page.viewportSize()
    if (!vp) throw new Error('viewport size unavailable')
    await page.mouse.click(vp.width / 2, vp.height / 2)
  }
  await back.click()
  await expect(page).toHaveURL(/\/(#\/)?$/)

  // Cards render after the live queries load, so poll until the scroll restore settles.
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - 200))
    .toBeLessThanOrEqual(5)
})

test('library.search.offline: filters the local catalog with no R2 request', async ({ page, context }) => {
  const r2 = await mockR2(context, { books: makeLibrary(30) })
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect(card(page)).toBeVisible()
  await page.waitForLoadState('networkidle')
  const before = r2.requests.length

  await context.setOffline(true)
  await page.getByRole('searchbox', { name: SEARCH }).fill('dau pha')

  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(card(page)).toBeVisible()
  expect(r2.requests.length).toBe(before)
})

test('library.cover.remote: uncached covers come from R2 and no EPUB is downloaded', async ({ page, context }) => {
  const r2 = await mockR2(context, { books: makeLibrary(30) })
  await page.goto('./')
  const img = card(page).locator('img')
  await expect(img).toHaveAttribute('src', new RegExp(`^https://r2\\.test/books/${DPK_ID}/cover\\.jpg\\?v=`))
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)

  expect(r2.count(coverPath(DPK_ID))).toBeGreaterThan(0)
  expect(r2.count(epubPath(DPK_ID))).toBe(0)
})

test('library.cover.offline: a cover shown online is still shown after an offline reload', async ({ page, context }) => {
  await mockR2(context, { books: makeLibrary(30) })
  // The first load installs the service worker; the reload is the first one it controls.
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect(card(page)).toBeVisible()
  await expect.poll(() => card(page).locator('img').evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)

  await context.setOffline(true)
  await page.reload()
  await expect(card(page)).toBeVisible()
  await expect.poll(() => card(page).locator('img').evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
})

test('library.progress.shown: a delayed EPUB download shows a progress bar on its card', async ({ page, context }) => {
  const books = makeLibrary(3).map((b) => (b.id === DPK_ID ? { ...b, delayMs: 4000 } : b))
  await mockR2(context, { books })
  await page.goto('./')
  const c = card(page)
  await expect(c).toBeVisible()

  await tapRead(page, c)
  await expect(c.getByRole('progressbar', { name: 'Đang tải truyện' })).toBeVisible()
  await expect(c.getByText(/^Đang tải/)).toBeVisible()
  await expect(c.getByRole('button', { name: 'Đọc', exact: true })).toHaveCount(0)
  await expect(c.getByRole('button', { name: 'Tải', exact: true })).toHaveCount(0)

  await expect(page).toHaveURL(new RegExp(`#/read/${DPK_ID}$`), { timeout: 15_000 })
})

test('library.filter.genre: a genre chip filters the grid and shows its count; the author select filters too', async ({ page, context }) => {
  await mockR2(context, { books: makeLibrary(30) })
  await page.goto('./')
  await expect(card(page)).toBeVisible()
  await openFilters(page)

  const chip = page.getByRole('radio', { name: /^Tiên hiệp \d+$/ })
  const chipCount = Number((await chip.textContent())?.match(/(\d+)$/)?.[1])
  expect(chipCount).toBeGreaterThan(0)
  await chip.click()
  await expect(chip).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('article')).toHaveCount(chipCount)
  await expect(card(page)).toHaveCount(0)

  await page.getByRole('radio', { name: 'Tất cả thể loại', exact: true }).click()
  await expect(card(page)).toBeVisible()

  await page.getByRole('button', { name: 'Tác giả' }).click()
  const option = page.getByRole('radiogroup', { name: 'Tác giả' }).getByRole('radio', { name: /^Nhĩ Căn \d+$/ })
  const optionCount = Number((await option.textContent())?.match(/(\d+)$/)?.[1])
  expect(optionCount).toBeGreaterThan(0)
  await option.click()
  await expect(page.getByRole('article')).toHaveCount(optionCount)
  await expect(card(page)).toHaveCount(0)
})
