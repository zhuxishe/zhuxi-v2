"use client"

import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"

const FAQ_KEYS = [1, 2, 3, 4, 5] as const

export function FaqSection() {
  const t = useTranslations("home")

  return (
    <section id="faq" className="section-padding" style={{ background: "var(--washi-dark, var(--muted))" }}>
      <div className="container mx-auto max-w-3xl">
        <div className="text-center mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold">
            <span className="gradient-text">{t("faqTitle")}</span>
          </h2>
          <p className="text-muted-foreground mt-4 text-sm sm:text-base">
            {t("faqSubtitle")}
          </p>
          <div className="ink-divider mt-8" />
        </div>

        <div className="space-y-3">
          {FAQ_KEYS.map((n) => (
            <details key={n} className="faq-item landing-card overflow-hidden">
              <summary className="flex items-center justify-between p-5 font-medium text-sm cursor-pointer">
                <span className="pr-4">{t(`faqQ${n}`)}</span>
                <ChevronDown size={16} className="faq-chevron text-muted-foreground shrink-0" />
              </summary>
              <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border/30 pt-4 mx-5 mb-0">
                {t(`faqA${n}`)}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
