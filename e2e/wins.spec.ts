import { expect, test } from '@playwright/test'

test('counts ten wins, restarts, and stays local', async ({ page }) => {
  const errors: Array<string> = []
  const externalRequests: Array<string> = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:5188/')) {
      externalRequests.push(request.url())
    }
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Little wins' })).toBeVisible()
  const add = page.getByRole('button', { name: 'Add a win' })
  const reset = page.getByRole('button', { name: 'Start again' })
  await expect(reset).toBeDisabled()
  await add.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('1', { exact: true })).toBeVisible()
  await Array.from({ length: 9 }).reduce(async previous => {
    await previous
    await add.click()
  }, Promise.resolve())
  await expect(page.getByText('Ten little wins. Nicely done.')).toBeVisible()
  await expect(add).toBeDisabled()
  await reset.click()
  await expect(page.getByText('0', { exact: true })).toBeVisible()
  await expect(add).toBeEnabled()
  await expect(reset).toBeDisabled()

  await add.click()
  await page.reload()
  await expect(page.getByText('0', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  expect(errors).toEqual([])
  expect(externalRequests).toEqual([])
})
