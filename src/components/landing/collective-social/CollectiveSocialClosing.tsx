import Link from "next/link"
import { ArrowLeft, Leaf } from "lucide-react"
import { getTranslations } from "next-intl/server"

export async function CollectiveSocialClosing() {
  const t = await getTranslations("collectiveSocial")

  return (
    <section className="relative overflow-hidden bg-[#3f5f3d] px-5 py-14 text-[#fffdf7] sm:px-8 sm:py-20 md:py-24">
      <div className="mx-auto grid max-w-6xl gap-7 md:grid-cols-[1fr_auto] md:items-center md:gap-10">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d5e5c9]">{t("closingEyebrow")}</p>
          <h2 className="mt-4 font-display text-[1.75rem] font-bold leading-tight tracking-[0.06em] sm:mt-5 sm:text-5xl">{t("closingTitle")}</h2>
          <p className="mt-4 text-sm leading-[1.75] text-[#eef4e8]/86 sm:mt-5 sm:text-base sm:leading-[1.9]">{t("closingBody")}</p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:gap-4 md:items-end">
          <span className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#edf5e7]/70 px-6 py-3 text-sm font-bold tracking-[0.08em] text-white/90" aria-label={t("closingState")}>
            {t("closingState")}
            <Leaf className="size-4" />
          </span>
          <Link href="/scripts" className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-[#e1edd7] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <ArrowLeft className="size-4" />
            {t("closingBack")}
          </Link>
        </div>
      </div>
    </section>
  )
}
