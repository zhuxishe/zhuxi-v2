import { type Page } from "@playwright/test"

const ADMIN_EMAIL = "e2e-admin@test.local"
const ADMIN_PASS = "E2eTest!Admin2026"
const PLAYER_EMAIL = "e2e-player@test.local"
const PLAYER_PASS = "E2eTest!Player2026"

export async function adminLogin(page: Page) {
  await page.goto("/admin/login")
  await page.waitForLoadState("networkidle")
  // 填写邮箱和密码
  await page.locator("input[name=email]").fill(ADMIN_EMAIL)
  await page.locator("input[name=password]").fill(ADMIN_PASS)
  await page.locator("button[type=submit]").click()
  await page.waitForURL("**/admin", { timeout: 15_000 })
}

export async function playerLogin(page: Page) {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  await page.locator("input[name=email], input[type=email]").first().fill(PLAYER_EMAIL)
  await page.locator("input[name=password], input[type=password]").first().fill(PLAYER_PASS)
  await page.locator("button[type=submit]").click()
  await page.waitForURL("**/app**", { timeout: 15_000 })
}
