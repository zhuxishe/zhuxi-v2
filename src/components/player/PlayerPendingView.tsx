"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { Clock, XCircle, Pencil } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

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
            <Link
              href="/app/interview-form"
              className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-2"}
            >
              <Pencil className="size-4 mr-1.5" />
              {t("editInfo")}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
