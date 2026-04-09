import { test, expect } from "@playwright/test"
import { playerLogin } from "./helpers/auth"

test.describe("玩家端", () => {
  test.beforeEach(async ({ page }) => {
    await playerLogin(page)
  })

  test("主页加载", async ({ page }) => {
    await page.goto("/app")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("main, [class*=page], [class*=app]").first()).toBeVisible()
  })

  test("剧本列表", async ({ page }) => {
    await page.goto("/app/scripts")
    await page.waitForLoadState("networkidle")
    // 页面加载成功
    await expect(page.locator("body")).toBeVisible()
  })

  test("匹配列表", async ({ page }) => {
    await page.goto("/app/matches")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toBeVisible()
  })
})
