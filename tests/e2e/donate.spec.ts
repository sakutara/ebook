import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { makeLibrary, mockR2 } from './r2-mock'

const BANNER_TEXT = 'Ủng hộ token dịch truyện'
const TABS = 'Thanh điều hướng'
const SIDE = 'Điều hướng chính'
const DPK = 'Đấu Phá Thương Khung'
const LOCAL_ORIGIN = 'http://localhost:4173'

function banner(page: Page) {
  return page.locator('aside[data-banner]')
}

function donateDialog(page: Page) {
  return page.getByRole('dialog', { name: BANNER_TEXT })
}

async function openDonate(page: Page): Promise<void> {
  await banner(page).getByRole('button', { name: 'Ủng hộ', exact: true }).click()
  await expect(donateDialog(page)).toBeVisible()
}

test('donate.banner.shown: banner text and the Ủng hộ button show on library, settings and request', async ({ page, context }) => {
  await mockR2(context, { books: makeLibrary(3) })
  for (const hash of ['#/', '#/settings', '#/request']) {
    await page.goto(`./${hash}`)
    await expect(banner(page)).toBeVisible()
    await expect(banner(page)).toContainText(BANNER_TEXT)
    await expect(banner(page).getByRole('button', { name: 'Ủng hộ', exact: true })).toBeVisible()
  }
})

test('donate.layout.narrow: banner sits on the tab bar, spans the width, no horizontal scroll and the last row is not hidden', async ({ page, context }, info) => {
  await mockR2(context, { books: makeLibrary(30) })
  await page.goto('./')
  await expect(page.getByRole('article', { name: DPK })).toBeVisible()
  await expect(page.locator('article')).toHaveCount(31)

  if (info.project.name === 'mobile') {
    const vw = page.viewportSize()?.width ?? 0
    const b = await banner(page).boundingBox()
    const tabs = await page.getByRole('navigation', { name: TABS }).boundingBox()
    if (!b || !tabs) throw new Error('banner or tab bar has no bounding box')
    expect(Math.abs(b.y + b.height - tabs.y), 'banner bottom vs tab bar top').toBeLessThanOrEqual(1)
    expect(b.x).toBeLessThanOrEqual(0.5)
    expect(b.x + b.width).toBeGreaterThanOrEqual(vw - 0.5)

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const { lastBottom, bannerTop } = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('article')]
      const last = cards[cards.length - 1]
      const bannerEl = document.querySelector('aside[data-banner]')
      return {
        lastBottom: last ? last.getBoundingClientRect().bottom : Number.POSITIVE_INFINITY,
        bannerTop: bannerEl ? bannerEl.getBoundingClientRect().top : Number.NEGATIVE_INFINITY,
      }
    })
    expect(lastBottom, 'last library card bottom vs banner top').toBeLessThanOrEqual(bannerTop)
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('donate.layout.wide: banner is in the content column, to the right of the side nav', async ({ page, context }, info) => {
  await mockR2(context, { books: makeLibrary(30) })
  await page.goto('./')
  await expect(page.getByRole('article', { name: DPK })).toBeVisible()

  if (info.project.name === 'desktop') {
    const b = await banner(page).boundingBox()
    const side = await page.getByRole('navigation', { name: SIDE }).boundingBox()
    if (!b || !side) throw new Error('banner or side nav has no bounding box')
    expect(b.x, 'banner left vs side nav right').toBeGreaterThanOrEqual(side.x + side.width - 0.5)
    await expect(page.getByRole('navigation', { name: TABS })).toBeHidden()
  }
})

test('donate.qr.offline: with the network down the dialog still renders the QR and makes no request', async ({ page, context }) => {
  await mockR2(context, { books: makeLibrary(3) })
  await page.goto('./')
  await expect(banner(page)).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForLoadState('networkidle')

  const external: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(LOCAL_ORIGIN)) external.push(request.url())
  })

  await context.setOffline(true)
  const before = external.length
  await openDonate(page)
  await expect(donateDialog(page).locator('[role="img"][aria-label="Mã QR chuyển khoản"] svg')).toBeVisible()
  expect(external.length, `external requests while offline: ${external.join(', ')}`).toBe(before)
})

test('donate.download.png: downloads ung-ho-50000.png as a PNG of at least 600 px', async ({ page, context }) => {
  await mockR2(context, { books: makeLibrary(3) })
  await page.goto('./')
  await openDonate(page)

  await donateDialog(page).getByRole('radio', { name: '50k', exact: true }).click()
  await expect(donateDialog(page).getByText('50.000 ₫', { exact: true })).toBeVisible()

  const downloaded = page.waitForEvent('download')
  await donateDialog(page).getByRole('button', { name: 'Tải mã QR', exact: true }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('ung-ho-50000.png')

  const path = await download.path()
  if (!path) throw new Error('download has no local path')
  const bytes = readFileSync(path)
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(600)
})
