import { useTranslations } from "next-intl"
import { CheckCircle } from "lucide-react"

export default function InterviewFormSuccessPage() {
  const t = useTranslations("interview")

  return (
    <main className="min-h-screen gradient-hero flex items-center justify-center px-4">
      <div className="text-center max-w-sm animate-scale-in">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle className="size-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {t("successTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("successDescription")}
        </p>
      </div>
    </main>
  )
}
