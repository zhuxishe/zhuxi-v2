import { describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"
import { getCanonicalRedirectUrl } from "@/lib/canonical-host"

function createRequest(url: string, headers: Record<string, string> = {}) {
  return {
    url,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null
      },
    },
  } as NextRequest
}

describe("getCanonicalRedirectUrl", () => {
  it("redirects vercel hosts to zhuxishe.jp", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(
      getCanonicalRedirectUrl(
        createRequest("https://zhuxi-v2.vercel.app/app?foo=1", {
          "x-forwarded-host": "zhuxi-v2.vercel.app",
        })
      )?.toString()
    ).toBe("https://zhuxishe.jp/app?foo=1")
    vi.unstubAllEnvs()
  })

  it("redirects www.zhuxishe.jp to zhuxishe.jp", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(
      getCanonicalRedirectUrl(
        createRequest("https://www.zhuxishe.jp/login", {
          "x-forwarded-host": "www.zhuxishe.jp",
        })
      )?.toString()
    ).toBe("https://zhuxishe.jp/login")
    vi.unstubAllEnvs()
  })

  it("does not redirect the canonical host", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(
      getCanonicalRedirectUrl(
        createRequest("https://zhuxishe.jp/app", {
          "x-forwarded-host": "zhuxishe.jp",
        })
      )
    ).toBeNull()
    vi.unstubAllEnvs()
  })
})
