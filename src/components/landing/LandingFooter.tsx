import Image from "next/image"
import { getTranslations } from "next-intl/server"

export async function LandingFooter() {
  const t = await getTranslations("home")

  return (
    <footer className="py-10 px-4 border-t border-border/40" style={{ background: "var(--washi-dark, var(--muted))" }}>
      <div className="container mx-auto max-w-5xl text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          <Image src="/logo.svg" alt="" width={24} height={24} className="size-6 opacity-70" />
          <span className="font-display font-bold text-primary">{t("title")}</span>
        </div>
        <p className="text-muted-foreground text-[11px] tracking-wider">
          {t("footerCopyright")}
        </p>
      </div>
    </footer>
  )
}
