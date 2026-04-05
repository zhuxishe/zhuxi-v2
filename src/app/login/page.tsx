"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { signIn, signUp } from "./actions"
import { Button } from "@/components/ui/button"

export default function LoginPage() {
  const t = useTranslations("login")
  const router = useRouter()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const result = mode === "login"
      ? await signIn(email, password)
      : await signUp(email, password)

    setLoading(false)
    if (result.error) setError(result.error)
    else router.push("/app")
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="flex rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${mode === "login" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {t("loginTab")}
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${mode === "register" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {t("registerTab")}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            required
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("passwordPlaceholder")}
            required
            minLength={6}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("loading") : mode === "login" ? t("loginButton") : t("registerButton")}
          </Button>
        </form>
      </div>
    </div>
  )
}
