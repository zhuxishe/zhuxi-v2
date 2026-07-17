"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { ChevronRight, MessageCircle } from "lucide-react"
import { buildPublicUrl } from "@/lib/site-url"

const LINE_CHANNEL_ID = (process.env.NEXT_PUBLIC_LIFF_ID || "").split("-")[0]

interface Props {
  lineUserId: string | null
  variant?: "card" | "row"
}

export function LineBindingCard({ lineUserId: initial, variant = "card" }: Props) {
  const searchParams = useSearchParams()
  const t = useTranslations("line")
  const success = searchParams?.get("line_success")
  const error = searchParams?.get("line_error")
  const [loading, setLoading] = useState(false)
  const [bound, setBound] = useState(() => !!initial || !!success)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(() =>
    success ? { ok: true, text: success } : error ? { ok: false, text: error } : null,
  )

  function handleBind() {
    // 用 crypto.getRandomValues 生成不可预测的 state，防 CSRF
    const arr = new Uint8Array(16)
    crypto.getRandomValues(arr)
    const state = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("")
    // 存 cookie 供 server-side callback 验证（5 分钟有效）
    const secureAttr = window.location.protocol === "https:" ? "; Secure" : ""
    document.cookie = `line_oauth_state=${state}; Path=/; Max-Age=300; SameSite=Lax${secureAttr}`
    const redirect = buildPublicUrl("/api/auth/line/callback")
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

  if (variant === "row") {
    return (
      <div>
        <button
          type="button"
          onClick={bound ? handleUnbind : handleBind}
          disabled={loading}
          aria-describedby={msg ? "line-binding-message" : undefined}
          className="flex min-h-[3.25rem] w-full items-center gap-3 py-1 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset disabled:opacity-60"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#06C755]/12 text-[#06A94A]">
            <MessageCircle className="size-[18px]" strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-5">{t("accountTitle")}</span>
            <span className="block text-[11px] leading-4 text-muted-foreground">
              {loading ? t("processing") : bound ? t("bound") : t("unbound")}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground/80" strokeWidth={1.7} aria-hidden="true" />
        </button>
        {msg && (
          <p
            id="line-binding-message"
            role="status"
            className={`pb-3 pl-[3.25rem] text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}
          >
            {msg.text}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#06C755] text-white">
            <MessageCircle className="size-[18px]" strokeWidth={2.2} aria-hidden="true" />
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

      {msg && <p role="status" className={`text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
    </div>
  )
}
