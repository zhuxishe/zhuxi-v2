"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

const LINE_CHANNEL_ID = (process.env.NEXT_PUBLIC_LIFF_ID || "").split("-")[0]

interface Props {
  lineUserId: string | null
}

export function LineBindingCard({ lineUserId: initial }: Props) {
  const searchParams = useSearchParams()
  const t = useTranslations("line")
  const [loading, setLoading] = useState(false)
  const [bound, setBound] = useState(!!initial)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const success = searchParams.get("line_success")
    const error = searchParams.get("line_error")
    if (success) { setMsg({ ok: true, text: success }); setBound(true) }
    else if (error) { setMsg({ ok: false, text: error }) }
  }, [searchParams])

  function handleBind() {
    const state = Math.random().toString(36).slice(2)
    const redirect = `${window.location.origin}/api/auth/line/callback`
    window.location.href = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${LINE_CHANNEL_ID}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}&scope=profile%20openid`
  }

  async function handleUnbind() {
    if (!confirm(t("confirmUnbind"))) return
    setLoading(true); setMsg(null)
    try {
      const res = await fetch("/api/auth/line/link", { method: "DELETE" })
      if (res.ok) { setMsg({ ok: true, text: t("unbindSuccess") }); setBound(false) }
      else { const d = await res.json(); setMsg({ ok: false, text: d.error }) }
    } catch { setMsg({ ok: false, text: t("operationFailed") }) }
    setLoading(false)
  }

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full bg-[#06C755] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738S0 4.935 0 10.304c0 4.814 4.27 8.846 10.035 9.608.391.084.922.258 1.057.592.121.303.079.777.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967C23.309 14.15 24 12.326 24 10.304"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium">{t("accountTitle")}</p>
            <p className="text-xs text-muted-foreground">{bound ? t("bound") : t("unbound")}</p>
          </div>
        </div>

        {bound ? (
          <button onClick={handleUnbind} disabled={loading}
            className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50">
            {loading ? t("processing") : t("unbind")}
          </button>
        ) : (
          <button onClick={handleBind}
            className="px-3 py-1.5 text-xs rounded-lg border border-[#06C755] text-[#06C755] hover:bg-[#06C755]/5">
            {t("bindLine")}
          </button>
        )}
      </div>

      {msg && <p className={`text-xs ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>}
    </div>
  )
}
