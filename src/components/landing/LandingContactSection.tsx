import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { MessageCircle, Sparkles } from "lucide-react"
import { publicContactHandle } from "@/lib/public-contact"

export async function LandingContactSection() {
  const t = await getTranslations("home")

  return (
    <section id="contact" className="relative bg-[#fbf8f1] px-5 py-14 md:py-20">
      <div className="container mx-auto max-w-5xl">
        <div className="grid gap-8 rounded-[2rem] border border-[#0f2c25]/15 bg-[#1E3932] p-7 text-white shadow-[0_24px_70px_rgba(16,37,31,0.18)] md:grid-cols-[1.1fr_0.9fr] md:p-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              {t("contactKicker")}
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight md:text-5xl">
              {t("contactTitle")}
            </h2>
            <p className="mt-5 text-sm leading-[1.85] text-white/72 md:text-base">
              {t("contactSubtitle")}
            </p>
          </div>

          <div className="flex flex-col justify-center gap-3">
            <p className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#1E3932]">
              <MessageCircle className="size-4" />
              {t("contactHandleLabel")}：{publicContactHandle}
            </p>
            <Link
              href="/scripts"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <Sparkles className="size-4" />
              {t("contactActivities")}
            </Link>
            <p className="inline-flex items-center justify-center gap-2 rounded-full bg-white/8 px-5 py-3 text-xs text-white/62">
              <MessageCircle className="size-4" />
              {t("contactSocialPending")}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
