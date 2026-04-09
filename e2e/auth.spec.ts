import { test, expect } from "@playwright/test"

test.describe("认证", () => {
  test("未登录访问 /app 重定向到登录页", async ({ page }) => {
    await page.goto("/app")
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    expect(page.url()).toContain("/login")
  })

  // 已知问题: admin layout 在本地 dev 中 pathname header 不可用导致空白页
  // Vercel 部署时正常（有 x-next-pathname header）
  test.fixme("未登录访问 /admin 重定向到登录页", async ({ page }) => {
    await page.goto("/admin")
    await page.waitForURL(/\/login/, { timeout: 10_000 })
  })

  test("管理员登录页面可访问", async ({ page }) => {
    await page.goto("/admin/login")
    await page.waitForLoadState("networkidle")
    // 登录表单应该可见
    await expect(page.locator("input[name=email]")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("input[name=password]")).toBeVisible()
    await expect(page.locator("button[type=submit]")).toBeVisible()
  })

  // 管理员登录功能测试 — 需要先修复 RLS 策略（admin_users 表的 SELECT 权限）
  test.skip("管理员登录成功", async ({ page }) => {
    await page.goto("/admin/login")
    await page.locator("input[name=email]").fill("e2e-admin@test.local")
    await page.locator("input[name=password]").fill("E2eTest!Admin2026")
    await page.locator("button[type=submit]").click()
    await page.waitForURL("**/admin", { timeout: 15_000 })
  })
})
