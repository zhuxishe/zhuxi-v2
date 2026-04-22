"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { buildPublicUrl } from "@/lib/site-url"

interface LoginSocialSectionProps {
  onError: (message: string | null) => void
  nextPath?: string
}

function isWebView() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent.toLowerCase()
  return /micromessenger|weibo|redbook|discover\/|aweme|douyin|qq\/|line\/|instagram|fbav|fban/.test(ua)
}

export function LoginSocialSection({ onError, nextPath = "/app" }: LoginSocialSectionProps) {
  const t = useTranslations("login")
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [inWebView, setInWebView] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    setInWebView(isWebView())
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has("code") && params.has("liffClientId")) {
      void handleLineLogin()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleGoogleLogin() {
    setLoading(true)
    onError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildPublicUrl(`/login/callback?next=${encodeURIComponent(nextPath)}`),
          queryParams: { prompt: "consent select_account" },
        },
      })

      if (error) {
        console.error("[handleGoogleLogin]", error)
        onError(t("loginError"))
        setLoading(false)
      }
    } catch (error) {
      console.error("[handleGoogleLogin] unexpected error:", error)
      onError(t("loginError"))
      setLoading(false)
    }
  }

  async function handleLineLogin() {
    setLoading(true)
    onError(null)
    const { authenticateWithLine } = await import("@/lib/liff/line-auth")
    const result = await authenticateWithLine()

    if (result.success) {
      router.push(nextPath)
      return
    }

    setLoading(false)
    if (result.error && result.error !== "Redirecting to LINE login") {
      onError(result.error)
    }
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  return (
    <div className="space-y-2">
      {inWebView ? (
        <div className="space-y-2">
          <Button variant="outline" className="w-full gap-2 opacity-50" disabled>
            <GoogleIcon />
            {t("googleLogin")}
          </Button>
          <p className="text-center text-xs text-amber-600">{t("webviewWarning")}</p>
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={handleCopyLink}>
            {linkCopied ? t("linkCopied") : t("copyLink")}
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="w-full gap-2" onClick={handleGoogleLogin} disabled={loading}>
          <GoogleIcon />
          {t("googleLogin")}
        </Button>
      )}

      <Button variant="outline" className="w-full gap-2" onClick={handleLineLogin} disabled={loading}>
        <LineIcon />
        {t("lineLogin")}
      </Button>
    </div>
  )
}

function LineIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="#06C755">
      <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738S0 4.935 0 10.304c0 4.814 4.27 8.846 10.035 9.608.391.084.922.258 1.057.592.121.303.079.777.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967C23.309 14.15 24 12.326 24 10.304" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}
