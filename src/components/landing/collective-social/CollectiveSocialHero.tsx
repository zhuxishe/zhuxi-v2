import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Leaf } from "lucide-react"
import { getTranslations } from "next-intl/server"

export async function CollectiveSocialHero() {
  const t = await getTranslations("collectiveSocial")

  return (
    <section className="relative min-h-[46rem] overflow-hidden border-b border-[#ded8cb] bg-[#f8f4ea] pt-20 lg:min-h-[44rem]" aria-labelledby="collective-social-title">
      <Image
        src="/images/landing/collective-social/collective-social-hero.png"
        alt={t("heroAlt")}
        fill
        preload
        sizes="100vw"
        className="object-cover object-[62%_center] sm:object-center"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(248,244,234,0.99)_0%,rgba(248,244,234,0.96)_30%,rgba(248,244,234,0.62)_50%,rgba(248,244,234,0.08)_76%)] max-sm:bg-[linear-gradient(180deg,rgba(248,244,234,0.99)_0%,rgba(248,244,234,0.96)_68%,rgba(248,244,234,0.78)_86%,rgba(248,244,234,0.22)_100%)]" />
      <div className="relative z-10 mx-auto flex min-h-[41rem] max-w-6xl items-center px-5 py-12 sm:px-8 lg:min-h-[39rem]">
        <div className="max-w-[30rem]">
          <Link
            href="/scripts"
            className="mb-10 inline-flex w-fit items-center gap-2 rounded-full text-sm font-semibold text-[#4f6843] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f8549] focus-visible:ring-offset-4"
          >
            <ArrowLeft className="size-4" />
            {t("back")}
          </Link>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#9eb886] bg-[#eef4e7] px-4 py-2 text-xs font-bold tracking-[0.14em] text-[#4f6843]">
            <Leaf className="size-4" />
            {t("status")}
          </span>
          <h1 id="collective-social-title" className="mt-7 font-display text-5xl font-bold leading-none tracking-[0.06em] text-[#172016] sm:text-6xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.38em] text-[#45613b]">{t("heroEnglish")}</p>
          <p className="mt-8 font-display text-xl font-semibold leading-relaxed text-[#2d3c29] sm:text-2xl">{t("heroSubtitle")}</p>
          <p className="mt-5 max-w-xl text-[15px] leading-[1.95] text-[#4d5548] sm:text-base">{t("heroBody")}</p>
        </div>
      </div>
    </section>
  )
}
