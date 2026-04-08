"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { LocaleSwitcher } from "@/components/LocaleSwitcher"

const NAV_LINKS = [
  { key: "navAbout", href: "#mission" },
  { key: "navScripts", href: "#scripts" },
  { key: "navTestimonials", href: "#testimonials" },
  { key: "navFaq", href: "#faq" },
  { key: "navContact", href: "#contact" },
] as const

export function LandingNav() {
  const t = useTranslations("home")
  const [open, setOpen] = useState(false)

  return (
    <nav className="glass-nav fixed top-0 left-0 right-0 z-50">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        {/* Brand */}
        <a href="#" className="flex items-center gap-2 group">
          <img src="/logo.svg" alt="" className="size-7 transition-transform duration-300 group-hover:rotate-6" />
          <span className="font-display text-lg font-bold text-primary tracking-wide">
            {t("title")}
          </span>
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-5">
          {NAV_LINKS.map(({ key, href }) => (
            <a
              key={key}
              href={href}
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              {t(key)}
            </a>
          ))}
          <div className="w-px h-4 bg-border/60" />
          <LocaleSwitcher />
          <Link
            href="/login"
            className="rounded-lg bg-primary px-4 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-all duration-200"
          >
            {t("navLogin")}
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border/40 bg-card/95 backdrop-blur-xl px-4 pb-4 animate-fade-in">
          {NAV_LINKS.map(({ key, href }) => (
            <a
              key={key}
              href={href}
              className="block py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setOpen(false)}
            >
              {t(key)}
            </a>
          ))}
          <div className="pt-3 border-t border-border/30 flex items-center justify-between">
            <LocaleSwitcher />
            <Link
              href="/login"
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              onClick={() => setOpen(false)}
            >
              {t("navLogin")}
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
