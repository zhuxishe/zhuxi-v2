"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { signIn, signUp, signInWithGoogle } from "./actions"
import { Button } from "@/components/ui/button"

function isWebView() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent.toLowerCase()
  // WeChat, Weibo, 小红书, TikTok/Douyin, QQ, LINE, Instagram, Facebook
  return /micromessenger|weibo|redbook|discover\/|aweme|douyin|qq\/|line\/|instagram|fbav|fban/.test(ua)
}

const ERROR_KEYS: Record<string, string> = {
  already_registered: "alreadyRegistered",
  password_invalid: "passwordInvalid",
  signup_failed: "signupFailed",
  email_exists_with_oauth: "emailExistsWithGoogle",
  login_failed: "loginFailed",
  email_not_confirmed: "emailNotConfirmed",
  login_error: "loginError",
}

export default function LoginPage() {
  const t = useTranslations("login")
  const router = useRouter()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)
  const [inWebView, setInWebView] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    setInWebView(isWebView())
  }, [])

  // Detect LIFF callback and auto-complete LINE auth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has("code") && params.has("liffClientId")) {
      handleLineLogin()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLineLogin() {
    setLoading(true)
    setError(null)
    const { authenticateWithLine } = await import("@/lib/liff/line-auth")
    const result = await authenticateWithLine()
    setLoading(false)
    if (result.success) router.push("/app")
    else if (result.error && result.error !== "Redirecting to LINE login") setError(result.error)
  }

  function translateError(errorCode: string): string {
    const key = ERROR_KEYS[errorCode]
    return key ? t(key) : errorCode
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (mode === "register") {
      const result = await signUp(email, password)
      setLoading(false)
      if (result.error) setError(translateError(result.error))
      else setRegistered(true)
    } else {
      const result = await signIn(email, password)
      setLoading(false)
      if (result.error) setError(translateError(result.error))
      else router.push("/app")
    }
  }

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  if (registered) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">{"\u{1F4E7}"}</div>
          <h1 className="text-xl font-bold">{t("checkEmail")}</h1>
          <p className="text-sm text-muted-foreground">{t("confirmSent", { email })}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        {/* Social Login */}
        <div className="space-y-2">
          {inWebView ? (
            <div className="space-y-2">
              <Button variant="outline" className="w-full gap-2 opacity-50" disabled>
                <GoogleIcon />
                {t("googleLogin")}
              </Button>
              <p className="text-xs text-amber-600 text-center">{t("webviewWarning")}</p>
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={handleCopyLink}>
                {linkCopied ? t("linkCopied") : t("copyLink")}
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full gap-2" onClick={() => signInWithGoogle()}>
              <GoogleIcon />
              {t("googleLogin")}
            </Button>
          )}
          <Button variant="outline" className="w-full gap-2" onClick={handleLineLogin} disabled={loading}>
            <LineIcon />
            {t("lineLogin")}
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">{t("orEmail")}</span></div>
        </div>

        {/* Email/Password Tabs */}
        <div className="flex rounded-lg bg-muted p-1">
          <button type="button" onClick={() => setMode("login")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${mode === "login" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            {t("loginTab")}
          </button>
          <button type="button" onClick={() => setMode("register")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${mode === "register" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
            {t("registerTab")}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")} required
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary transition-colors" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={t("passwordPlaceholder")} required minLength={6}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary transition-colors" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("loading") : mode === "login" ? t("loginButton") : t("registerButton")}
          </Button>
        </form>
      </div>
    </div>
  )
}

function LineIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="#06C755">
      <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738S0 4.935 0 10.304c0 4.814 4.27 8.846 10.035 9.608.391.084.922.258 1.057.592.121.303.079.777.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967C23.309 14.15 24 12.326 24 10.304"/>
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
