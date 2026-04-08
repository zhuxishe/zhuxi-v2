"use client"

import { useTranslations } from "next-intl"
import { Send } from "lucide-react"

export function ContactSection() {
  const t = useTranslations("home")

  return (
    <section id="contact" className="section-padding relative">
      <div className="container mx-auto max-w-xl">
        <div className="text-center mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold">
            <span className="gradient-text">{t("contactTitle")}</span>
          </h2>
          <p className="text-muted-foreground mt-4 text-sm sm:text-base">
            {t("contactSubtitle")}
          </p>
          <div className="ink-divider mt-8" />
        </div>

        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <input
            type="text"
            placeholder={t("contactName")}
            className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm outline-none transition-all duration-200 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 placeholder:text-muted-foreground/60"
          />
          <input
            type="email"
            placeholder={t("contactEmail")}
            className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm outline-none transition-all duration-200 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 placeholder:text-muted-foreground/60"
          />
          <textarea
            rows={4}
            placeholder={t("contactMessage")}
            className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm outline-none resize-none transition-all duration-200 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 placeholder:text-muted-foreground/60"
          />
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3.5 text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition-all duration-200"
          >
            {t("contactSend")}
            <Send size={15} />
          </button>
        </form>
      </div>
    </section>
  )
}
