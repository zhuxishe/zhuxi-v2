"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { cancelRegistration } from "@/app/app/matching/survey/cancellation-actions"
import { participationRecordHref } from "@/lib/matching/participation-display"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

interface Props {
  roundId: string
  roundName: string
  expectedUpdatedAt: string | null
  disabled?: boolean
  returnToRecord?: boolean
  onBusyChange?: (busy: boolean) => void
}

export function CancelRegistrationButton({ roundId, roundName, expectedUpdatedAt, disabled = false,
  returnToRecord = false, onBusyChange }: Props) {
  const router = useRouter()
  const t = useTranslations("participation")
  const errors = useTranslations("errors")
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function handleCancel() {
    if (disabled || inFlight.current || done) return
    inFlight.current = true
    setBusy(true)
    onBusyChange?.(true)
    setError(null)
    try {
      const result = await cancelRegistration({ roundId, expectedUpdatedAt })
      if (result.error) { setError(errors.has(result.error) ? errors(result.error) : errors("saveFailed")); return }
      setDone(true)
      setOpen(false)
      if (returnToRecord) router.replace(participationRecordHref(roundId))
      else router.refresh()
    } catch {
      setError(errors("networkError"))
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  if (done) return <p role="status" className="text-center text-sm text-muted-foreground">{t("status.cancelled")}</p>
  return <>
    <Button type="button" variant="destructive" disabled={disabled || busy} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setError(null); setOpen(true) }}
      className="h-auto min-h-11 whitespace-normal rounded-xl border-destructive/20 px-4 py-2.5 text-sm font-medium leading-5 text-[color-mix(in_oklab,var(--destructive),var(--foreground)_20%)] hover:border-destructive/30">
      {t("cancelRegistration")}
    </Button>
    <Dialog open={open} onOpenChange={(value) => { if (!inFlight.current) setOpen(value) }}>
      <DialogContent showCloseButton={!busy} className="rounded-2xl p-6">
        <DialogTitle className="pr-6 text-lg font-semibold">{t("cancelTitle")}</DialogTitle>
        <DialogDescription className="break-words leading-6">{t("cancelDescription", { name: roundName })}</DialogDescription>
        {error && <p role="alert" className="text-sm leading-6 text-destructive">{error}</p>}
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)} className="h-auto min-h-12 whitespace-normal rounded-xl px-3 py-3">{t("keepRegistration")}</Button>
          <Button variant="destructive" disabled={disabled || busy} onClick={handleCancel} aria-busy={busy}
            className="h-auto min-h-12 whitespace-normal rounded-xl px-3 py-3">{t(busy ? "cancelling" : "confirmCancel")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
