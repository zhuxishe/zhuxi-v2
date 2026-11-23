"use client"

import { useRef, useState } from "react"
import { unstable_rethrow } from "next/navigation"
import { submitActivityNoMatchRequestAction } from "@/app/app/matches/rounds/[roundId]/reviews/actions"
import { activityReviewErrorMessage, activityReviewV2Copy } from "@/lib/activity-reviews/copy"
import type { ActivityNoMatchRequest as Request, SubmitActivityNoMatchRequestInput } from "@/lib/activity-reviews/types"

type Action = (input: SubmitActivityNoMatchRequestInput) => Promise<{ success?: boolean; error?: string; request?: Request }>
export function ActivityNoMatchRequest({ roundId, targetMemberId, targetName, existing, canRequest, locale, onSaved, action = submitActivityNoMatchRequestAction }: {
  roundId: string; targetMemberId: string; targetName: string; existing?: Request; canRequest: boolean; locale: string; onSaved: (request: Request) => void; action?: Action
}) {
  const copy = activityReviewV2Copy(locale)
  const [reason, setReason] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const inFlight = useRef(false)
  const retry = useRef<{ key: string; id: string } | null>(null)
  async function submit() {
    if (inFlight.current || existing || !canRequest) return
    if (!confirmed) { setError(copy.interactionRequired); return }
    if (Array.from(reason.trim()).length > 1000) { setError(copy.reasonTooLong); return }
    const key = JSON.stringify([roundId, targetMemberId, reason.trim()])
    if (retry.current?.key !== key) retry.current = { key, id: crypto.randomUUID() }
    inFlight.current = true; setBusy(true); setError("")
    try {
      const result = await action({ roundId, targetMemberId, reason: reason.trim(), interactionConfirmed: true, requestId: retry.current.id })
      if (!result.success || !result.request) { setError(activityReviewErrorMessage(result.error, locale)); return }
      onSaved(result.request)
    } catch (error) { unstable_rethrow(error); setError(activityReviewErrorMessage(undefined, locale)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <details className="rounded-2xl border border-border bg-card p-4">
    <summary className="min-h-8 cursor-pointer text-sm font-semibold">{copy.noMatch} · {targetName}</summary>
    <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.noMatchHelp}</p>
    {existing ? <div className="mt-3 rounded-lg bg-muted/30 p-3 text-sm"><p>{copy[existing.status]}</p>{existing.reason && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5">{existing.reason}</p>}</div> : !canRequest ? <p className="mt-3 text-sm text-muted-foreground">{copy.unavailable}</p> : <div className="mt-4 space-y-3">
      <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4 shrink-0" />{copy.interaction}</label>
      <label className="block text-sm font-medium">{copy.reason}<textarea value={reason} disabled={busy} onChange={event => setReason(event.target.value)} maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm font-normal leading-6" /></label>
      <button type="button" onClick={submit} disabled={busy} className="min-h-11 w-full rounded-xl border border-primary/25 px-4 py-3 text-sm font-semibold text-primary">{busy ? copy.submitting : copy.submit}</button>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </details>
}
