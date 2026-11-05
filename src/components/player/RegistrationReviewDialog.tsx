"use client"

import Link from "next/link"
import { useLocale } from "next-intl"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { registrationReviewCopy } from "@/lib/registration-review-gate/copy"
import { registrationReviewHref } from "@/lib/registration-review-gate/navigation"
import type { RegistrationReviewBlocker } from "@/lib/registration-review-gate/types"
import { formatSurveyTime } from "@/lib/matching/survey-window"

export function RegistrationReviewDialog({ open, roundId, fromParticipation = false, blockers, failed = false,
  busy = false, onCancel, onRetry }: {
  open: boolean; roundId: string; fromParticipation?: boolean; blockers: RegistrationReviewBlocker[]
  failed?: boolean; busy?: boolean; onCancel: () => void; onRetry: () => void
}) {
  const locale = useLocale()
  const copy = registrationReviewCopy(locale)
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel() }}>
    <DialogContent showCloseButton={!busy} className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{failed ? copy.failed : copy.title}</DialogTitle>
        <DialogDescription>{failed ? copy.retry : copy.description}</DialogDescription>
      </DialogHeader>
      {!failed && <ul className="space-y-3" aria-label={copy.title}>
        {blockers.map((blocker) => <li key={blocker.round_id} className="rounded-xl border p-3">
          <p className="break-words font-medium">{blocker.round_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{copy.ended}：{formatSurveyTime(blocker.ended_at, locale)}</p>
          <Link href={registrationReviewHref(blocker, { roundId, fromParticipation })} prefetch={false}
            className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            {copy.review}<span className="sr-only">：{blocker.round_name}</span>
          </Link>
        </li>)}
      </ul>}
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onCancel}>{failed ? copy.back : copy.cancel}</Button>
        <Button disabled={busy} onClick={onRetry}>{busy ? copy.checking : failed ? copy.retry : copy.recheck}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
