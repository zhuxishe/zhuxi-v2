"use client"

import { CircleCheck } from "lucide-react"
import { useTranslations } from "next-intl"

export function RegistrationStatus({ editable }: { editable: boolean }) {
  const t = useTranslations("survey.registration")
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4">
      <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-primary">{t("registered")}</p>
        <p className="text-xs leading-6 text-muted-foreground">{t(editable ? "editHint" : "registeredHint")}</p>
      </div>
    </div>
  )
}
