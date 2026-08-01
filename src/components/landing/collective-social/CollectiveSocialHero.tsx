import Image from "next/image"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getTranslations } from "next-intl/server"

export async function CollectiveSocialHero() {
  const t = await getTranslations("collectiveSocial")

  return (
    <section className="relative min-h-[40rem] overflow-hidden border-b border-[#ded8cb] bg-[#f8f4ea] pt-20 sm:min-h-[42rem] lg:min-h-[44rem]" aria-labelledby="collective-social-title">
      <Image
        src="/images/landing/collective-social/collective-social-hero.png"
        alt={t("heroAlt")}
        fill
        preload
        sizes="100vw"
        className="object-cover object-[64%_center] sm:object-center"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(248,244,234,0.99)_0%,rgba(248,244,234,0.96)_30%,rgba(248,244,234,0.62)_50%,rgba(248,244,234,0.08)_76%)] max-sm:bg-[linear-gradient(180deg,rgba(248,244,234,0.99)_0%,rgba(248,244,234,0.96)_58%,rgba(248,244,234,0.76)_76%,rgba(248,244,234,0.12)_100%)]" />
      <div className="relative z-10 mx-auto flex min-h-[35rem] max-w-6xl items-start px-5 py-8 sm:min-h-[37rem] sm:items-center sm:px-8 sm:py-12 lg:min-h-[39rem]">
        <div className="max-w-[30rem]">
          <Link
            href="/scripts"
            className="mb-7 inline-flex min-h-11 w-fit items-center gap-2 rounded-full py-2 text-sm font-semibold text-[#4f6843] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f8549] focus-visible:ring-offset-4 sm:mb-10"
          >
            <ArrowLeft className="size-4" />
            {t("back")}
          </Link>
          <h1 id="collective-social-title" className="font-display text-[2.75rem] font-bold leading-[1.08] tracking-[0.06em] text-[#172016] sm:text-6xl sm:leading-none">
            {t("heroTitle")}
          </h1>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.32em] text-[#45613b] sm:mt-4 sm:text-xs sm:tracking-[0.38em]">{t("heroEnglish")}</p>
          <p className="mt-6 font-display text-xl font-semibold leading-[1.55] text-[#2d3c29] sm:mt-8 sm:text-2xl sm:leading-relaxed">{t("heroSubtitle")}</p>
          <p className="mt-4 max-w-xl text-[15px] leading-[1.78] text-[#4d5548] sm:mt-5 sm:text-base sm:leading-[1.95]">{t("heroBody")}</p>
        </div>
      </div>
    </section>
  )
}
