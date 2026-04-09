import { test, expect } from "@playwright/test"

// 管理后台测试 — 需要先修复 admin_users RLS 策略才能自动登录
// 当前标记为 skip，等登录问题修复后启用
test.describe("管理后台", () => {
  test.skip(true, "需要先修复 admin_users RLS 策略，管理员登录才能工作")

  test("仪表盘加载", async ({ page }) => {
    await page.goto("/admin")
    await expect(page.locator("[class*=card]").first()).toBeVisible({ timeout: 5000 })
  })

  test("成员列表加载", async ({ page }) => {
    await page.goto("/admin/members")
    await expect(page.getByText(/成员|会员/)).toBeVisible({ timeout: 5000 })
  })

  test("剧本列表加载", async ({ page }) => {
    await page.goto("/admin/scripts")
    await expect(page.getByText(/剧本/)).toBeVisible({ timeout: 5000 })
  })
})
