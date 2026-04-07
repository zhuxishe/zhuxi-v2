"use client"

import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"

const FAQ_KEYS = [1, 2, 3, 4, 5] as const

export function FaqSection() {
  const t = useTranslations("home")

  return (
    <section id="faq" className="section-padding">
      <div className="container mx-auto max-w-3xl">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center">
          <span className="gradient-text">{t("faqTitle")}</span>
        </h2>
        <p className="text-center text-muted-foreground mb-14 mt-4">
          {t("faqSubtitle")} 👇
        </p>

        <div className="space-y-4">
          {FAQ_KEYS.map((n) => (
            <details key={n} className="faq-item landing-card overflow-hidden group">
              <summary className="flex items-center justify-between p-5 font-medium text-sm">
                <span>{t(`faqQ${n}`)}</span>
                <ChevronDown size={18} className="faq-chevron text-muted-foreground shrink-0 ml-4" />
              </summary>
              <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">
                {t(`faqA${n}`)}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
