"use client"

import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { Button } from "@/components/ui/button"

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("error")
  const router = useRouter()
  const [retrying, startTransition] = useTransition()

  function retry() {
    if (retrying) return
    startTransition(() => {
      // Reset alone re-renders the same failed RSC payload. Fetch the current
      // server data as part of the retry while preserving the login session.
      router.refresh()
      reset()
    })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
      <p className="text-4xl">😥</p>
      <p className="text-sm text-muted-foreground">{t("message")}</p>
      <Button variant="outline" onClick={retry} disabled={retrying} aria-busy={retrying}>{t("retry")}</Button>
    </div>
  )
}
