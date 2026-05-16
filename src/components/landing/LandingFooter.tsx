import Image from "next/image"
import Link from "next/link"
import { getTranslations } from "next-intl/server"

export async function LandingFooter() {
  const t = await getTranslations("home")

  return (
    <footer className="relative overflow-hidden bg-[#c8ddb8] px-4 pb-8 pt-14">
      <div className="absolute -top-8 left-1/2 h-16 w-[120%] -translate-x-1/2 rounded-[50%] bg-[#fffdf7]" />
      <div className="relative mx-auto max-w-5xl text-center space-y-3">
        <div className="flex items-center justify-center gap-2">
          <Image src="/logo.svg" alt="" width={24} height={24} className="size-6 opacity-70" />
          <span className="font-display font-bold text-primary">{t("title")}</span>
          <span className="text-sm tracking-[0.28em] text-primary/80">· ZHUXISHE</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-[#49643d]">
          <Link href="/organization" className="transition hover:text-foreground">
            {t("footerAbout")}
          </Link>
          <Link href="/scripts" className="transition hover:text-foreground">
            {t("navScripts")}
          </Link>
          <Link href="/join" className="transition hover:text-foreground">
            {t("navAbout")}
          </Link>
          <Link href="/faq" className="transition hover:text-foreground">
            {t("navFaq")}
          </Link>
        </div>
        <a href={`mailto:${t("footerEmail")}`} className="block text-xs text-[#49643d] transition hover:text-foreground">
          {t("footerEmail")}
        </a>
        <p className="text-[11px] tracking-wider text-[#49643d]/80">
          {t("footerCopyright")}
        </p>
      </div>
    </footer>
  )
}
