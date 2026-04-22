"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { signIn, signUp } from "./actions"
import { LoginSocialSection } from "@/components/auth/LoginSocialSection"
import { Button } from "@/components/ui/button"
import { HomeLink } from "@/components/auth/HomeLink"

const ERROR_KEYS: Record<string, string> = {
  already_registered: "alreadyRegistered",
  password_invalid: "passwordInvalid",
  signup_failed: "signupFailed",
  email_exists_with_oauth: "emailExistsWithGoogle",
  login_failed: "loginFailed",
  email_not_confirmed: "emailNotConfirmed",
  login_error: "loginError",
}

function getSafeNextPath() {
  if (typeof window === "undefined") return "/app"
  const next = new URLSearchParams(window.location.search).get("next")
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app"
  return next.startsWith("/app") ? next : "/app"
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
  const [nextPath, setNextPath] = useState("/app")

  useEffect(() => {
    setNextPath(getSafeNextPath())
    const params = new URLSearchParams(window.location.search)
    if (params.get("error") === "oauth_failed") {
      setError(t("loginError"))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      else router.push(nextPath)
    }
  }

  if (registered) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <HomeLink className="justify-center" />
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
        <HomeLink className="justify-center" />
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        {/* Social Login */}
        <LoginSocialSection onError={setError} nextPath={nextPath} />

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
