"use client"

import { ArrowLeft } from "lucide-react"

interface ComposerHeaderProps {
  title: string
  submitLabel: string
  formId: string
  pending: boolean
  disabled?: boolean
  onBack: () => void
}

export function ComposerHeader({
  title,
  submitLabel,
  formId,
  pending,
  disabled = false,
  onBack,
}: ComposerHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md">
      <div className="grid h-14 grid-cols-[5rem_1fr_5rem] items-center px-2">
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-medium text-foreground">
          <ArrowLeft className="size-5" />
          返回
        </button>
        <h1 className="text-center text-base font-semibold">{title}</h1>
        <button
          type="submit"
          form={formId}
          disabled={disabled || pending}
          className="min-h-11 rounded-xl px-2 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "处理中…" : submitLabel}
        </button>
      </div>
    </header>
  )
}
