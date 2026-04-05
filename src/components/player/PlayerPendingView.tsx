"use client"

import { useTranslations } from "next-intl"
import { Clock, XCircle } from "lucide-react"

interface Props {
  rejected?: boolean
}

export function PlayerPendingView({ rejected }: Props) {
  const t = useTranslations("pending")

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        {rejected ? (
          <>
            <XCircle className="size-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold">{t("rejectedTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("rejectedDescription")}</p>
          </>
        ) : (
          <>
            <Clock className="size-12 text-primary mx-auto" />
            <h1 className="text-xl font-bold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
          </>
        )}
      </div>
    </div>
  )
}
