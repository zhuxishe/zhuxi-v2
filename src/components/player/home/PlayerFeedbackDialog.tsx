"use client"

import { useActionState, useState } from "react"
import { CheckCircle2, X } from "lucide-react"
import { submitPlayerFeedbackAction } from "@/app/app/feedback-actions"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { PLAYER_FEEDBACK_INITIAL_STATE } from "@/lib/player-feedback/constants"

interface Props {
  locale: string
  submissionId: string
  labels: {
    title: string
    description: string
    category: string
    categories: Record<"product" | "activity" | "matching" | "community" | "other", string>
    content: string
    placeholder: string
    counter: string
    submit: string
    submitting: string
    successTitle: string
    successDescription: string
    done: string
    close: string
  }
  onClose: () => void
}

export function PlayerFeedbackDialog({ locale, submissionId, labels, onClose }: Props) {
  const [content, setContent] = useState("")
  const [state, formAction, pending] = useActionState(submitPlayerFeedbackAction, PLAYER_FEEDBACK_INITIAL_STATE)
  const contentLength = Array.from(content.trim()).length
  const contentError = state.fieldErrors?.content ?? state.error

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose() }}>
      <DialogContent showCloseButton={false} className="bottom-0 top-auto max-h-[calc(100dvh-0.5rem)] w-full max-w-md translate-y-0 overflow-y-auto overscroll-contain rounded-b-none rounded-t-[28px] bg-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:bottom-auto sm:top-1/2 sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:-translate-y-1/2 sm:rounded-[24px] sm:pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <DialogTitle className="text-lg font-semibold">{labels.title}</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5">{labels.description}</DialogDescription>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label={labels.close} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:cursor-wait disabled:opacity-40">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {state.success ? (
          <div className="py-6 text-center" role="status">
            <CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden="true" />
            <h3 className="mt-3 font-semibold">{labels.successTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{labels.successDescription}</p>
            <button type="button" onClick={onClose} className="mt-5 min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">{labels.done}</button>
          </div>
        ) : (
          <form action={formAction} className="mt-4 space-y-4">
            <input type="hidden" name="pagePath" value="/app" />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="submissionId" value={submissionId} />
            <label className="block">
              <span className="text-sm font-medium">{labels.category}</span>
              <select
                name="category"
                defaultValue="product"
                disabled={pending}
                aria-invalid={Boolean(state.fieldErrors?.category)}
                aria-describedby={state.fieldErrors?.category ? "player-feedback-category-error" : undefined}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
              >
                {Object.entries(labels.categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {state.fieldErrors?.category && <span id="player-feedback-category-error" role="alert" className="mt-1 block text-xs text-destructive">{state.fieldErrors.category}</span>}
            </label>
            <label className="block">
              <span className="text-sm font-medium">{labels.content}</span>
              <textarea
                name="content"
                required
                disabled={pending}
                value={content}
                onChange={(event) => setContent(Array.from(event.target.value).slice(0, 500).join(""))}
                aria-invalid={Boolean(contentError)}
                aria-describedby={contentError ? "player-feedback-content-error" : "player-feedback-content-counter"}
                placeholder={labels.placeholder}
                className="mt-1.5 min-h-32 w-full resize-none rounded-xl border border-input bg-background px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
              />
              <span className="mt-1 flex items-start justify-between gap-3 text-xs">
                <span id="player-feedback-content-error" role={contentError ? "alert" : undefined} className="text-destructive">{contentError}</span>
                <span id="player-feedback-content-counter" className="ml-auto shrink-0 text-muted-foreground">{labels.counter.replace("{count}", String(contentLength))}</span>
              </span>
            </label>
            <button type="submit" disabled={pending || contentLength < 10} className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-45">
              {pending ? labels.submitting : labels.submit}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
