import { test, expect, type Locator, type Page } from '@playwright/test'
import { coverPath, epubPath, makeLibrary, mockR2 } from './r2-mock'

const DPK = 'Đấu Phá Thương Khung'
const DPK_ID = 'dau-pha-thuong-khung'
const SEARCH = 'Tìm truyện'
const TABS = 'Thanh điều hướng'
const SIDE = 'Điều hướng chính'
const TOOLBAR_GENRES = 'Thể loại'
const TOOLBAR_STATUS = 'Bộ lọc'
const TOOLBAR_AUTHOR = 'Tác giả'

function card(page: Page, title = DPK): Locator {
  return page.getByRole('article', { name: title })
}

type Box = { x: number; y: number; width: number; height: number }

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
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
  else expect(columns).toBeGreaterThanOrEqual(6)

  const tabs = page.getByRole('navigation', { name: TABS })
  const side = page.getByRole('navigation', { name: SIDE })
  const genreRow = page.getByRole('radiogroup', { name: TOOLBAR_GENRES })
  if (narrow) {
    await expect(tabs).toBeVisible()
    await expect(side).toBeHidden()
    // The genre chips scroll sideways inside their own row: the row overflows and clips.
    const row = await genreRow.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrollable: el.scrollWidth > el.clientWidth,
    }))
    expect(row.overflowX).toBe('auto')
    expect(row.scrollable).toBe(true)
  } else {
    await expect(side).toBeVisible()
    await expect(tabs).toBeHidden()
    // Status filter sits above; genre chips and author select share the next row, select on the right.
    const author = page.getByRole('combobox', { name: TOOLBAR_AUTHOR })
    const boxes = [await page.getByRole('radiogroup', { name: TOOLBAR_STATUS }).boundingBox(), await genreRow.boundingBox(), await author.boundingBox()]
    if (boxes.some((b) => b === null)) throw new Error('toolbar control has no bounding box')
    const [status, group, select] = boxes as Box[]
    expect(group.y, 'genre chips sit below the status filter').toBeGreaterThanOrEqual(status.y + status.height - 1)

    const fits = await genreRow.evaluate((el) => el.scrollWidth <= el.clientWidth)
    expect(fits, 'genre chips never scroll sideways at 1280 px').toBe(true)

    const chips = await genreRow.getByRole('radio').all()
    expect(chips.length).toBeGreaterThan(1)
    for (const chip of chips) {
      const cb = await chip.boundingBox()
      if (!cb) throw new Error('genre chip has no bounding box')
      expect(cb.y).toBeGreaterThanOrEqual(group.y - 1)
      expect(cb.y + cb.height).toBeLessThanOrEqual(group.y + group.height + 1)
    }

    expect(select.x, 'author select sits to the right of the genre chips').toBeGreaterThanOrEqual(group.x + group.width - 1)
    expect(Math.abs(select.y - group.y), 'author select and genre chips share the top').toBeLessThanOrEqual(8)

    // At 820 px (md, narrow side nav) the chips must still fit inside their box and clear the select.
    await page.setViewportSize({ width: 820, height: 800 })
    const group820 = await genreRow.boundingBox()
    const select820 = await author.boundingBox()
    if (!group820 || !select820) throw new Error('toolbar control has no bounding box at 820 px')
    for (const chip of await genreRow.getByRole('radio').all()) {
      const cb = await chip.boundingBox()
      if (!cb) throw new Error('genre chip has no bounding box at 820 px')
      expect(cb.x).toBeGreaterThanOrEqual(group820.x - 1)
      expect(cb.x + cb.width).toBeLessThanOrEqual(group820.x + group820.width + 1)
      expect(cb.y).toBeGreaterThanOrEqual(group820.y - 1)
      expect(cb.y + cb.height).toBeLessThanOrEqual(group820.y + group820.height + 1)
      expect(overlaps(cb, select820), 'genre chip does not overlap the author select at 820 px').toBe(false)
    }
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

  await dpk.getByRole('button', { name: 'Đọc', exact: true }).click()
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

  await expect(page).toHaveURL(/#\/$/)
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
  await visible.getByRole('button', { name: 'Đọc', exact: true }).click()
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

  await c.getByRole('button', { name: 'Đọc', exact: true }).click()
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

  const chip = page.getByRole('radio', { name: /^Tiên hiệp \d+$/ })
  const chipCount = Number((await chip.textContent())?.match(/(\d+)$/)?.[1])
  expect(chipCount).toBeGreaterThan(0)
  await chip.click()
  await expect(chip).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('article')).toHaveCount(chipCount)
  await expect(card(page)).toHaveCount(0)

  await page.getByRole('radio', { name: 'Tất cả thể loại', exact: true }).click()
  await expect(card(page)).toBeVisible()

  const select = page.getByRole('combobox', { name: 'Tác giả' })
  const option = select.locator('option', { hasText: 'Nhĩ Căn' })
  const optionCount = Number((await option.textContent())?.match(/\((\d+)\)$/)?.[1])
  expect(optionCount).toBeGreaterThan(0)
  await select.selectOption((await option.getAttribute('value')) ?? '')
  await expect(page.getByRole('article')).toHaveCount(optionCount)
  await expect(card(page)).toHaveCount(0)
})
