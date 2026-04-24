"use client"

import Link from "next/link"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowRight, CheckCircle, Send } from "lucide-react"
import { submitContactForm } from "@/app/actions/contact"

export function ContactSection() {
  const t = useTranslations("home")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputCls = "w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm outline-none transition-all duration-200 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 placeholder:text-muted-foreground/60"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError(t("contactRequired")); return
    }
    setSubmitting(true); setError(null)
    const result = await submitContactForm({ name, email, message })
    setSubmitting(false)
    if (result.error) { setError(result.error); return }
    setSent(true)
  }

  if (sent) {
    return (
      <section id="contact" className="section-padding relative">
        <div className="container mx-auto max-w-xl text-center py-20">
          <CheckCircle className="mx-auto h-12 w-12 text-primary mb-4" />
          <h3 className="text-xl font-bold">{t("contactSentTitle")}</h3>
          <p className="text-muted-foreground mt-2 text-sm">{t("contactSentDesc")}</p>
        </div>
      </section>
    )
  }

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
        <form className="space-y-4" onSubmit={handleSubmit}>
          <input type="text" placeholder={t("contactName")} value={name}
            onChange={(e) => setName(e.target.value)} className={inputCls} />
          <input type="email" placeholder={t("contactEmail")} value={email}
            onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          <textarea rows={4} placeholder={t("contactMessage")} value={message}
            onChange={(e) => setMessage(e.target.value)} className={`${inputCls} resize-none`} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3.5 text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
            {submitting ? "..." : t("contactSend")}
            <Send size={15} />
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-border/60 bg-card/70 px-5 py-4 text-sm text-muted-foreground shadow-[0_10px_30px_rgba(16,37,31,0.05)]">
          <p className="leading-7">{t("contactAboutHint")}</p>
          <Link
            href="/organization"
            className="mt-3 inline-flex items-center gap-2 font-semibold text-[#00754A] transition hover:text-[#006241]"
          >
            {t("contactAboutCta")}
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  )
}
