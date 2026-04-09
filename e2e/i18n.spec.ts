import { test, expect } from "@playwright/test"

test.describe("国际化", () => {
  test("默认中文", async ({ page }) => {
    await page.goto("/")
    const skipBtn = page.getByText(/跳过|スキップ/)
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click()
    }
    const html = page.locator("html")
    await expect(html).toHaveAttribute("lang", "zh-CN")
  })

  test("切换日语后保持", async ({ page }) => {
    // 设置 cookie 切换到日语
    await page.context().addCookies([{
      name: "NEXT_LOCALE",
      value: "ja",
      domain: "localhost",
      path: "/",
    }])
    await page.goto("/")
    const skipBtn = page.getByText(/跳过|スキップ/)
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click()
    }
    const html = page.locator("html")
    await expect(html).toHaveAttribute("lang", "ja")
  })

  test("刷新后语言保持", async ({ page }) => {
    await page.context().addCookies([{
      name: "NEXT_LOCALE",
      value: "ja",
      domain: "localhost",
      path: "/",
    }])
    await page.goto("/")
    await page.reload()
    const html = page.locator("html")
    await expect(html).toHaveAttribute("lang", "ja")
  })
})
