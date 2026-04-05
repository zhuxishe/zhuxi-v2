"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { sendMagicLink } from "./actions"
import { Button } from "@/components/ui/button"

export default function PlayerLoginPage() {
  const t = useTranslations("playerLogin")
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const result = await sendMagicLink(email)
    setSending(false)
    if (result.error) setError(result.error)
    else setSent(true)
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">📧</div>
          <h1 className="text-xl font-bold">{t("checkEmail")}</h1>
          <p className="text-sm text-muted-foreground">{t("linkSent", { email })}</p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            required
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? t("sending") : t("send")}
          </Button>
        </form>
      </div>
    </div>
  )
}
