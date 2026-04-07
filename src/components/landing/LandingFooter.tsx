import { useTranslations } from "next-intl"

export function LandingFooter() {
  const t = useTranslations("home")

  return (
    <footer className="py-12 px-4 border-t bg-card">
      <div className="container mx-auto max-w-5xl text-center">
        <p className="font-display font-bold text-primary text-lg">{t("title")}</p>
        <p className="text-muted-foreground text-xs mt-2">{t("footerCopyright")}</p>
      </div>
    </footer>
  )
}
