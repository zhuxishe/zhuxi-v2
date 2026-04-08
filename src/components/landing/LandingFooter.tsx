import { useTranslations } from "next-intl"

export function LandingFooter() {
  const t = useTranslations("home")

  return (
    <footer className="py-10 px-4 border-t border-border/40" style={{ background: "var(--washi-dark, var(--muted))" }}>
      <div className="container mx-auto max-w-5xl text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          <img src="/logo.png" alt="" className="size-6 opacity-70" />
          <span className="font-display font-bold text-primary">{t("title")}</span>
        </div>
        <p className="text-muted-foreground text-[11px] tracking-wider">
          {t("footerCopyright")}
        </p>
      </div>
    </footer>
  )
}
