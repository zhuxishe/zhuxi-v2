"use client"

import { useRef, useState } from "react"
import { CircleHelp, X } from "lucide-react"
import { requestCancellation } from "@/app/app/matches/[id]/actions"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface Labels {
  requestCancel: string
  cancelHelpLabel: string
  cancelHelpDescription: string
  cancelFormTitle: string
  cancelReasonPlaceholder: string
  cancelBack: string
  confirmCancel: string
  submitting: string
  publicationChanged: string
  saveFailed: string
}

interface Props {
  matchId: string
  publicationVersion: number
  labels: Labels
}

export function CancelRequestForm({ matchId, publicationVersion, labels }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const submitting = useRef(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setError("")

    const fd = new FormData()
    fd.set("matchId", matchId)
    fd.set("reason", reason)
    fd.set("publicationVersion", String(publicationVersion))

    try {
      const result = await requestCancellation(fd)
      if (result.error) {
        setError(result.error === "publicationChanged" ? labels.publicationChanged : result.error === "saveFailed" ? labels.saveFailed : result.error)
      } else {
        setOpen(false)
        router.refresh()
      }
    } catch {
      setError(labels.saveFailed)
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!submitting.current) setOpen(nextOpen) }}>
      <DialogTrigger
        aria-label={labels.cancelHelpLabel}
        title={labels.cancelHelpLabel}
        render={<button type="button" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2" />}
      >
        <CircleHelp className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md" showCloseButton={false}>
        <div className="space-y-2 pr-10">
          <DialogTitle>{labels.cancelFormTitle}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">{labels.cancelHelpDescription}</DialogDescription>
        </div>
        <DialogClose
          aria-label={labels.cancelBack}
          disabled={loading}
          render={<button type="button" className="absolute right-1.5 top-1.5 inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-50" />}
        >
          <X className="size-4" aria-hidden="true" />
        </DialogClose>
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label={labels.cancelReasonPlaceholder}
            placeholder={labels.cancelReasonPlaceholder}
            maxLength={500}
            disabled={loading}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
            rows={4}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={loading} onClick={() => setOpen(false)} className="min-h-11 px-5">{labels.cancelBack}</Button>
            <Button type="submit" disabled={loading} className="min-h-11 px-5">{loading ? labels.submitting : labels.confirmCancel}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
