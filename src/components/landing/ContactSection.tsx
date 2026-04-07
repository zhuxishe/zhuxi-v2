"use client"

import { useTranslations } from "next-intl"
import { Send } from "lucide-react"

export function ContactSection() {
  const t = useTranslations("home")

  return (
    <section id="contact" className="section-padding bg-muted/50">
      <div className="container mx-auto max-w-xl">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center">
          <span className="gradient-text">{t("contactTitle")}</span>
        </h2>
        <p className="text-center text-muted-foreground mb-14 mt-4">
          {t("contactSubtitle")}
        </p>

        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <input
            type="text"
            placeholder={t("contactName")}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="email"
            placeholder={t("contactEmail")}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <textarea
            rows={4}
            placeholder={t("contactMessage")}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none resize-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t("contactSend")}
            <Send size={16} />
          </button>
        </form>
      </div>
    </section>
  )
}
