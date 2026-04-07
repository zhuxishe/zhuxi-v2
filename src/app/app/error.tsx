"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("error")

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
      <p className="text-4xl">😥</p>
      <p className="text-sm text-muted-foreground">{t("message")}</p>
      <Button variant="outline" onClick={reset}>{t("retry")}</Button>
    </div>
  )
}
