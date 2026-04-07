"use client"

import { useState } from "react"
import { requestCancellation } from "@/app/app/matches/[id]/actions"
import { useRouter } from "next/navigation"

interface Props {
  matchId: string
  t: (key: string) => string
}

export function CancelRequestForm({ matchId, t }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
      >
        {t("requestCancel")}
      </button>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const fd = new FormData()
    fd.set("matchId", matchId)
    fd.set("reason", reason)

    const result = await requestCancellation(fd)
    setLoading(false)

    if (result.error) {
      setError(result.error)
    } else {
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
      <p className="text-sm font-medium text-red-700">{t("cancelFormTitle")}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("cancelReasonPlaceholder")}
        className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
        rows={3}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
        >
          {t("cancelBack")}
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          {loading ? t("submitting") : t("confirmCancel")}
        </button>
      </div>
    </form>
  )
}
