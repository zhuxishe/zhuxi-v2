import { getTranslations } from "next-intl/server"

export async function CollectiveSocialManifesto() {
  const t = await getTranslations("collectiveSocial")

  return (
    <section className="px-5 py-20 sm:px-8 md:py-28">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4f6843]">{t("manifestoEyebrow")}</p>
        <h2 className="mx-auto mt-6 max-w-3xl font-display text-3xl font-semibold leading-[1.55] text-[#1d291b] sm:text-4xl">
          {t("manifestoTitle")}
        </h2>
        <p className="mx-auto mt-7 max-w-2xl text-base leading-[2] text-[#51594b]">{t("manifestoBody")}</p>
        <blockquote className="mx-auto mt-9 max-w-xl border-y border-[#cfd9c5] py-5 font-display text-lg font-semibold tracking-[0.04em] text-[#4f6843] sm:text-xl">
          {t("manifestoQuote")}
        </blockquote>
      </div>
    </section>
  )
}
