"use client"

import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"

const FAQ_KEYS = [1, 2, 3, 4, 5] as const

export function FaqSection() {
  const t = useTranslations("home")

  return (
    <section id="faq" className="bg-[#f2f0eb] px-5 py-16 md:py-24">
      <div className="container mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bamboo">
            {t("faqKicker")}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight md:text-5xl">
            {t("faqTitle")}
          </h2>
          <p className="mt-4 text-sm leading-[1.85] text-muted-foreground md:text-base">
            {t("faqSubtitle")}
          </p>
        </div>

        <div className="space-y-3">
          {FAQ_KEYS.map((n) => (
            <details key={n} className="faq-item landing-card overflow-hidden bg-white">
              <summary className="flex cursor-pointer items-center justify-between p-5 text-sm font-semibold">
                <span className="pr-4">{t(`faqQ${n}`)}</span>
                <ChevronDown size={16} className="faq-chevron text-muted-foreground shrink-0" />
              </summary>
              <div className="border-t border-border/30 px-5 pb-5 pt-4 text-sm leading-[1.85] text-muted-foreground">
                {t(`faqA${n}`)}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
