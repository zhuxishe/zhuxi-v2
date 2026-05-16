import { getTranslations } from "next-intl/server"
import { CircleHelp, MessageCircle } from "lucide-react"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { FaqSection } from "@/components/landing/FaqSection"

export default async function PublicFaqPage() {
  const t = await getTranslations("home")

  return (
    <>
      <LandingNav />
      <main className="bg-[#fffdf7] pt-28 text-[#171717] grain-overlay">
        <section className="relative mx-auto max-w-5xl px-5 py-20 text-center">
          <CircleHelp className="mx-auto mb-6 size-16 rounded-full bg-[#ffd4da] p-3 text-[#111]" />
          <h1 className="font-display text-6xl font-bold tracking-[0.14em]">{t("faqTitle")}</h1>
          <div className="mx-auto mt-4 h-3 w-56 rounded-[50%] border-b-[9px] border-[#f3cf55]" />
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-[#3d4438]">{t("faqSubtitle")}</p>
        </section>
        <FaqSection compact />
        <section className="mx-auto max-w-4xl px-5 pb-16">
          <div className="rounded-[1.6rem] border border-[#e5dfd3] bg-white p-7 text-center shadow-[0_14px_36px_rgba(43,53,35,0.08)]">
            <MessageCircle className="mx-auto mb-4 size-10 text-[#6b9a51]" />
            <p className="font-display text-2xl font-bold">{t("contactTitle")}</p>
            <a href={`mailto:${t("footerEmail")}`} className="mt-4 inline-flex rounded-full bg-[#6b9a51] px-6 py-3 text-sm font-semibold text-white">
              {t("footerEmail")}
            </a>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  )
}
