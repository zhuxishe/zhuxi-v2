import { getTranslations } from "next-intl/server"

export async function CollectiveSocialManifesto() {
  const t = await getTranslations("collectiveSocial")

  return (
    <section className="px-5 py-14 sm:px-8 sm:py-20 md:py-28">
      <div className="mx-auto max-w-4xl text-left sm:text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4f6843]">{t("manifestoEyebrow")}</p>
        <h2 className="mx-auto mt-5 max-w-3xl font-display text-[1.75rem] font-semibold leading-[1.42] text-[#1d291b] sm:mt-6 sm:text-4xl sm:leading-[1.55]">
          {t("manifestoTitle")}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl whitespace-pre-line text-[15px] leading-[1.8] text-[#51594b] sm:mt-7 sm:text-base sm:leading-[2]">{t("manifestoBody")}</p>
        <blockquote className="mx-auto mt-7 max-w-xl border-y border-[#cfd9c5] py-4 text-center font-display text-base font-semibold leading-[1.7] tracking-[0.04em] text-[#4f6843] sm:mt-9 sm:py-5 sm:text-xl">
          {t("manifestoQuote")}
        </blockquote>
      </div>
    </section>
  )
}
