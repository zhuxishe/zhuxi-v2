import Link from "next/link"
import { CheckCircle } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Button } from "@/components/ui/button"

export default async function SurveySuccessPage() {
  const t = await getTranslations("survey")

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <CheckCircle className="size-16 text-green-500 mb-4" />
      <h1 className="text-lg font-bold mb-2">{t("success.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t("success.description")}
      </p>
      <div className="flex gap-3">
        <Link href="/app">
          <Button>{t("success.backToHome")}</Button>
        </Link>
        <Link href="/app/matching/survey">
          <Button variant="outline">{t("success.editSurvey")}</Button>
        </Link>
      </div>
    </div>
  )
}
