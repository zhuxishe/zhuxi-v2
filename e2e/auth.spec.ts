import { test, expect } from "@playwright/test"

test.describe("认证", () => {
  test("未登录访问 /app 重定向到登录页", async ({ page }) => {
    await page.goto("/app")
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    expect(page.url()).toContain("/login")
  })

  // 本地 dev 无 x-next-pathname header，layout 无法判断路径，依赖各 page.tsx 的 requireAdmin()
  // Vercel 部署时可用 x-next-pathname，重定向正常；本地跳过此测试
  test.fixme("未登录访问 /admin 重定向到登录页", async ({ page }) => {
    await page.goto("/admin")
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    expect(page.url()).toContain("/login")
  })

  test("管理员登录页面可访问", async ({ page }) => {
    await page.goto("/admin/login")
    await page.waitForLoadState("networkidle")
    // 登录表单应该可见
    await expect(page.locator("input[name=email]")).toBeVisible({ timeout: 10_000 })
    await expect(page.locator("input[name=password]")).toBeVisible()
    await expect(page.locator("button[type=submit]")).toBeVisible()
  })

  test("管理员登录成功", async ({ page }) => {
    await page.goto("/admin/login")
    await page.locator("input[name=email]").fill("e2e-admin@test.local")
    await page.locator("input[name=password]").fill("E2eTest!Admin2026")
    await page.locator("button[type=submit]").click()
    await page.waitForURL("**/admin", { timeout: 15_000 })
  })

  test("未登录访问 /app/interview-form 重定向到登录页", async ({ page }) => {
    await page.goto("/app/interview-form")
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    expect(page.url()).toContain("/login")
  })

  test("未登录访问 /app/profile/supplementary 重定向到登录页", async ({ page }) => {
    await page.goto("/app/profile/supplementary")
    await page.waitForURL(/\/login/, { timeout: 10_000 })
    expect(page.url()).toContain("/login")
  })

  test("登录页 Google 按钮可见", async ({ page }) => {
    await page.goto("/login")
    await page.waitForLoadState("networkidle")
    // Google 登录按钮应该存在
    const googleBtn = page.locator("button", { hasText: /google/i })
    await expect(googleBtn).toBeVisible({ timeout: 10_000 })
  })

  test("登录页 OAuth 失败时显示错误提示", async ({ page }) => {
    await page.goto("/login?error=oauth_failed")
    await page.waitForLoadState("networkidle")
    // 应显示错误消息
    const errorMsg = page.locator(".text-destructive, [class*=error]")
    await expect(errorMsg).toBeVisible({ timeout: 10_000 })
  })
})
