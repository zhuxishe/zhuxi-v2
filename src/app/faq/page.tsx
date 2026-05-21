import { getTranslations } from "next-intl/server"
import { CircleHelp, MessageCircle } from "lucide-react"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { FaqSection } from "@/components/landing/FaqSection"
import { publicContactHandle } from "@/lib/public-contact"

export default async function PublicFaqPage() {
  const t = await getTranslations("home")

  return (
    <>
      <LandingNav />
      <main className="bg-[#fffdf7] pt-28 text-[#171717] grain-overlay">
        <section className="relative mx-auto max-w-5xl px-5 py-14 text-center">
          <CircleHelp className="mx-auto mb-5 size-14 rounded-full bg-[#ffd4da] p-3 text-[#111]" />
          <h1 className="mx-auto max-w-[18rem] font-display text-4xl font-bold leading-tight tracking-[0.04em] md:max-w-none md:text-6xl md:tracking-[0.12em]">
            {t("faqTitle")}
          </h1>
          <div className="mx-auto mt-4 h-3 w-36 rounded-[50%] border-b-[8px] border-[#f3cf55] md:w-52" />
        </section>
        <FaqSection compact />
        <section className="mx-auto max-w-4xl px-5 pb-16">
          <div className="rounded-[1.6rem] border border-[#e5dfd3] bg-white p-7 text-center shadow-[0_14px_36px_rgba(43,53,35,0.08)]">
            <MessageCircle className="mx-auto mb-4 size-10 text-[#6b9a51]" />
            <p className="font-display text-2xl font-bold">{t("contactTitle")}</p>
            <p className="mt-4 inline-flex rounded-full bg-[#6b9a51] px-6 py-3 text-sm font-semibold text-white">
              {t("contactHandleLabel")}：{publicContactHandle}
            </p>
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  )
}
