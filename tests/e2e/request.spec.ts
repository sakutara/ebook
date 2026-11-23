import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { makeLibrary, mockDrive } from './drive-mock'

const TABS = 'Thanh điều hướng'
const SIDE = 'Điều hướng chính'
const NAV_LABELS = ['Thư viện', 'Yêu cầu', 'Cài đặt']
const FORM_GLOB = 'https://docs.google.com/forms/**'
const TITLE_LABEL = 'Tên truyện'
const AUTHOR_LABEL = 'Tác giả'
const SUBMIT = 'Gửi yêu cầu'

/** Records every POST to the Google Form and answers it locally. Context-level so the service worker path is covered too. */
async function interceptForm(context: BrowserContext): Promise<string[]> {
  const posts: string[] = []
  await context.route(FORM_GLOB, async (route) => {
    const request = route.request()
    if (request.method() === 'POST') posts.push(request.postData() ?? '')
    await route.fulfill({ status: 200, body: '' })
  })
  return posts
}

async function fillAndSubmit(page: Page, title: string, author = ''): Promise<void> {
  await page.getByLabel(TITLE_LABEL, { exact: true }).fill(title)
  if (author !== '') await page.getByLabel(AUTHOR_LABEL, { exact: true }).fill(author)
  await page.getByRole('button', { name: SUBMIT, exact: true }).click()
}

/** Raw IndexedDB count of the outbox store, so the test does not depend on app internals. */
async function outboxCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('ebook')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const req = db.transaction('outbox').objectStore('outbox').count()
          req.onerror = () => reject(req.error)
          req.onsuccess = () => {
            db.close()
            resolve(req.result)
          }
        }
      }),
  )
}

test('story-request.layout.narrow: fields are full width, stacked, with no horizontal scroll', async ({ page, context }, info) => {
  await mockDrive(context, makeLibrary(3))
  await page.goto('./#/request')
  await expect(page.getByLabel(TITLE_LABEL, { exact: true })).toBeVisible()

  if (info.project.name === 'mobile') {
    const form = await page.locator('form').boundingBox()
    const title = await page.getByLabel(TITLE_LABEL, { exact: true }).boundingBox()
    const author = await page.getByLabel(AUTHOR_LABEL, { exact: true }).boundingBox()
    if (!form || !title || !author) throw new Error('form or fields have no bounding box')
    expect(title.width).toBeGreaterThanOrEqual(form.width * 0.8)
    expect(author.width).toBeGreaterThanOrEqual(form.width * 0.8)
    expect(author.y, 'author field sits below title field').toBeGreaterThan(title.y + title.height)
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('story-request.layout.wide: form is at most 40rem and the "Đã yêu cầu" list sits beside it', async ({ page, context }, info) => {
  await mockDrive(context, makeLibrary(3))
  await page.goto('./#/request')
  await expect(page.getByLabel(TITLE_LABEL, { exact: true })).toBeVisible()

  if (info.project.name === 'desktop') {
    const form = await page.locator('form').boundingBox()
    const list = await page.getByRole('region', { name: 'Đã yêu cầu' }).boundingBox()
    if (!form || !list) throw new Error('form or list has no bounding box')
    expect(form.width, 'form width').toBeLessThanOrEqual(640.5)
    expect(list.x, 'list left vs form right').toBeGreaterThanOrEqual(form.x + form.width - 0.5)
  }
})

test('app-shell.routes.request: tapping the Yêu cầu nav item opens #/request and marks it current', async ({ page, context }, info) => {
  await mockDrive(context, makeLibrary(3))
  await page.goto('./')
  const nav = page.getByRole('navigation', { name: info.project.name === 'mobile' ? TABS : SIDE })
  const link = nav.getByRole('link', { name: 'Yêu cầu', exact: true })
  await link.click()

  await expect(page).toHaveURL(/#\/request$/)
  await expect(link).toHaveAttribute('aria-current', 'page')
  await expect(page.getByLabel(TITLE_LABEL, { exact: true })).toBeVisible()
})

test('app-shell.layout.narrow / app-shell.layout.wide: three nav items in order, bottom tabs on mobile and side nav on desktop', async ({ page, context }, info) => {
  await mockDrive(context, makeLibrary(3))
  await page.goto('./')
  const tabs = page.getByRole('navigation', { name: TABS })
  const side = page.getByRole('navigation', { name: SIDE })
  if (info.project.name === 'mobile') {
    await expect(tabs).toBeVisible()
    await expect(side).toBeHidden()
    const labels = (await tabs.getByRole('link').allTextContents()).map((t) => t.trim())
    expect(labels).toEqual(NAV_LABELS)
  } else {
    await expect(side).toBeVisible()
    await expect(tabs).toBeHidden()
    const labels = (await side.getByRole('link').allTextContents()).map((t) => t.trim())
    expect(labels).toEqual(NAV_LABELS)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('story-request.submit.online: one POST with the expected body, row marked sent and empty outbox', async ({ page, context }) => {
  const posts = await interceptForm(context)
  await mockDrive(context, makeLibrary(3))
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.goto('./#/request')

  await fillAndSubmit(page, 'phàm nhân tu tiên', 'vong ngữ')
  await expect(page.getByText('Đã gửi yêu cầu', { exact: true })).toBeVisible()

  await expect.poll(() => posts.length).toBe(1)
  const body = new URLSearchParams(posts[0])
  expect(body.get('entry.111')).toBe('Phàm Nhân Tu Tiên')
  expect(body.get('entry.222')).toBe('Vong Ngữ')
  expect(body.get('entry.333')).toBe('pham nhan tu tien|vong ngu')
  expect([...body.keys()].sort()).toEqual(['entry.111', 'entry.222', 'entry.333'])

  const row = page.getByRole('listitem').filter({ hasText: 'Phàm Nhân Tu Tiên' })
  await expect(row).toContainText('Đã gửi')
  await expect.poll(() => outboxCount(page)).toBe(0)
  expect(posts).toHaveLength(1)
})

test('story-request.submit.offline + story-request.submit.resync: offline submit shows Chờ gửi, then one POST and Đã gửi once back online', async ({ page, context }, info) => {
  const posts = await interceptForm(context)
  await mockDrive(context, makeLibrary(3))
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.goto('./#/request')
  await expect(page.getByLabel(TITLE_LABEL, { exact: true })).toBeVisible()

  await context.setOffline(true)
  await fillAndSubmit(page, 'phàm nhân tu tiên', 'vong ngữ')
  const toastText = page.getByText('Đã lưu, sẽ gửi khi có mạng', { exact: true })
  await expect(toastText).toBeVisible()
  if (info.project.name === 'mobile') {
    // The toast must sit above the donate banner, not over its text and button.
    const toastBox = await page.locator('[role="status"][aria-live="polite"]').boundingBox()
    const bannerBox = await page.locator('aside[data-banner]').boundingBox()
    if (!toastBox || !bannerBox) throw new Error('toast or banner has no bounding box')
    expect(toastBox.y + toastBox.height, 'toast bottom vs banner top').toBeLessThanOrEqual(bannerBox.y + 1)
  }

  const row = page.getByRole('listitem').filter({ hasText: 'Phàm Nhân Tu Tiên' })
  await expect(row).toContainText('Chờ gửi')
  await expect.poll(() => outboxCount(page)).toBe(1)
  expect(posts, 'no POST while offline').toHaveLength(0)

  await context.setOffline(false)
  await expect.poll(() => posts.length).toBe(1)
  await expect(row).toContainText('Đã gửi')
  await expect.poll(() => outboxCount(page)).toBe(0)
  expect(posts).toHaveLength(1)
})
