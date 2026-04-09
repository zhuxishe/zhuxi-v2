import { test, expect } from "@playwright/test"
import { adminLogin } from "./helpers/auth"

test.describe("管理后台", () => {
  test.beforeEach(async ({ page }) => {
    await adminLogin(page)
  })

  test("仪表盘加载", async ({ page }) => {
    await page.goto("/admin")
    await expect(page.locator("[class*=card]").first()).toBeVisible({ timeout: 5000 })
  })

  test("成员列表加载", async ({ page }) => {
    await page.goto("/admin/members")
    await expect(page.getByRole("heading", { name: /成员/ })).toBeVisible({ timeout: 5000 })
  })

  test("剧本列表加载", async ({ page }) => {
    await page.goto("/admin/scripts")
    await expect(page.getByRole("heading", { name: /剧本/ })).toBeVisible({ timeout: 5000 })
  })
})
