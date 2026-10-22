"use client"

import { useLocale } from "next-intl"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { matchingProfileCopy, type MatchingProfileKind } from "@/lib/matching/profile-readiness"

export function MatchingProfileDialog({ open, missing, failed = false, busy = false, onCancel, onComplete, onRetry }: {
  open: boolean
  missing: MatchingProfileKind[]
  failed?: boolean
  busy?: boolean
  onCancel: () => void
  onComplete: () => void
  onRetry: () => void
}) {
  const copy = matchingProfileCopy(useLocale())
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel() }}>
    <DialogContent showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle>{failed ? copy.failed : copy.title}</DialogTitle>
        <DialogDescription>{failed ? copy.retry : copy.description}</DialogDescription>
      </DialogHeader>
      {!failed && <ul className="space-y-2 pl-5 list-disc" aria-label={copy.title}>
        {missing.map((kind) => <li key={kind}>{copy.labels[kind]}</li>)}
      </ul>}
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onCancel}>{copy.cancel}</Button>
        <Button disabled={busy} onClick={failed ? onRetry : onComplete}>
          {busy ? copy.checking : failed ? copy.retry : copy.complete}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
