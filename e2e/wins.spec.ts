import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

test('shares wins live, keeps separate sessions, and survives reload', async ({
  browser,
  page,
}) => {
  const id = randomUUID()
  const errors: Array<string> = []
  page.on('pageerror', error => errors.push(error.message))
  const otherContext = await browser.newContext()
  const other = await otherContext.newPage()
  try {
    await Promise.all([
      page.goto(`/?session=${id}`),
      other.goto(`http://127.0.0.1:5188/?session=${id}`),
    ])
    const addA = page.getByRole('button', { name: 'Add a win' })
    const addB = other.getByRole('button', { name: 'Add a win' })
    await expect(addA).toBeEnabled()
    await expect(addB).toBeEnabled()
    await Promise.all([addA.click(), addB.click()])
    await expect(page.getByText('2', { exact: true })).toBeVisible()
    await expect(other.getByText('2', { exact: true })).toBeVisible()
    await other.reload()
    await expect(other.getByText('2', { exact: true })).toBeVisible()
    await expect(addB).toBeEnabled()
    await other.getByRole('button', { name: 'Start again' }).click()
    await expect(page.getByText('0', { exact: true })).toBeVisible()
    await expect(other.getByText('0', { exact: true })).toBeVisible()
    await addA.focus()
    await page.keyboard.press('Enter')
    await expect(other.getByText('1', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText('1', { exact: true })).toBeVisible()
    await other.goto(`http://127.0.0.1:5188/?session=${randomUUID()}`)
    await expect(addB).toBeEnabled()
    await expect(other.getByText('0', { exact: true })).toBeVisible()
    await expect(page.getByText('1', { exact: true })).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await otherContext.close()
  }
})

test('creates shareable URLs and reconnects without replaying clicks', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\?session=[0-9a-f-]{36}$/)
  const firstUrl = page.url()
  const add = page.getByRole('button', { name: 'Add a win' })
  await expect(add).toBeEnabled()
  await add.click()
  await expect(page.getByText('1', { exact: true })).toBeVisible()
  await context.setOffline(true)
  // Force the connection closed, as a network loss would, while keeping the page loaded.
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await expect(add).toBeDisabled({ timeout: 15000 })
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(add).toBeEnabled({ timeout: 15000 })
  await expect(page.getByText('1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New session' }).click()
  await expect(page).not.toHaveURL(firstUrl)
  await expect(add).toBeEnabled()
  await expect(page.getByText('0', { exact: true })).toBeVisible()
})

test('resyncs a committed action after its HTTP response is lost without retrying it', async ({
  page,
}) => {
  const id = randomUUID()
  let attempts = 0
  await page.route(`**/api/sessions/${id}/increment`, async route => {
    attempts += 1
    await route.fetch()
    await route.abort('failed')
  })
  await page.goto(`/?session=${id}`)
  const add = page.getByRole('button', { name: 'Add a win' })
  await expect(add).toBeEnabled()
  await add.click()
  await expect(page.getByText('1', { exact: true })).toBeVisible()
  await expect(add).toBeEnabled({ timeout: 15000 })
  expect(attempts).toBe(1)
  await page.reload()
  await expect(page.getByText('1', { exact: true })).toBeVisible()
})

test('rejects malformed session links and offers a new session', async ({
  page,
}) => {
  await page.goto('/?session=invalid')
  await expect(page.getByRole('alert')).toHaveText(
    'This session link is invalid.',
  )
  await expect(page.getByRole('button', { name: 'Add a win' })).toHaveCount(0)
  await page.getByRole('button', { name: 'New session' }).click()
  await expect(page).toHaveURL(/\?session=[0-9a-f-]{36}$/)
  await expect(page.getByRole('button', { name: 'Add a win' })).toBeEnabled()
})

test('stops at ten for both people', async ({ page, request }) => {
  const id = randomUUID()
  const base = 'http://127.0.0.1:5188'
  await page.goto(`/?session=${id}`)
  await expect(page.getByRole('button', { name: 'Add a win' })).toBeEnabled()
  await Promise.all(
    Array.from({ length: 12 }, () =>
      request.post(`${base}/api/sessions/${id}/increment`, {
        data: {},
        headers: { Origin: base },
      }),
    ),
  )
  await expect(page.getByText('Ten little wins. Nicely done.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add a win' })).toBeDisabled()
})
