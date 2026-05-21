"use client"

import Image from "next/image"
import { useState } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { LocaleSwitcher } from "@/components/LocaleSwitcher"
import { HOME_SKIP_INTRO_HREF, rememberLandingIntroSeen } from "@/lib/landing-intro"

const NAV_LINKS = [
  { key: "navHome", href: "/" },
  { key: "navOrganization", href: "/organization" },
  { key: "navScripts", href: "/scripts" },
  { key: "navReviews", href: "/reviews" },
  { key: "navAbout", href: "/join" },
  { key: "navFaq", href: "/faq" },
] as const

export function LandingNav() {
  const t = useTranslations("home")
  const [open, setOpen] = useState(false)

  return (
    <nav className="pointer-events-none fixed left-0 right-0 top-0 z-50 px-5 py-5">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link
          href={HOME_SKIP_INTRO_HREF}
          onClick={rememberLandingIntroSeen}
          className="pointer-events-auto group flex items-center gap-3"
        >
          <Image
            src="/logo.svg"
            alt=""
            width={44}
            height={44}
            loading="eager"
            className="size-11 transition-transform duration-300 group-hover:rotate-6"
          />
          <span className="leading-none">
            <span className="block font-display text-2xl font-bold tracking-[0.08em] text-[#111]">
              {t("title")}
            </span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.42em] text-[#111]/70">
              ZHUXISHE
            </span>
          </span>
        </Link>

        <button
          className="pointer-events-auto grid size-16 place-items-center rounded-full bg-[#6b9a51] text-white shadow-[0_10px_24px_rgba(65,103,48,0.28)] transition hover:bg-[#5e8d45]"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X size={30} /> : <Menu size={32} />}
        </button>
      </div>

      {open && (
        <div className="pointer-events-auto mx-auto mt-4 max-w-5xl rounded-[2rem] border border-[#dce5d0] bg-white/95 p-4 shadow-[0_20px_60px_rgba(44,62,34,0.18)] backdrop-blur-xl animate-fade-in">
          <div className="grid gap-2 sm:grid-cols-2">
            {NAV_LINKS.map(({ key, href }) => (
              <Link
                key={key}
                href={href}
                className="rounded-2xl px-4 py-3 text-sm font-semibold text-[#243320] transition hover:bg-[#edf4e7]"
                onClick={() => setOpen(false)}
              >
                {t(key)}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#e6eadf] pt-3">
            <LocaleSwitcher />
            <Link href="/login" className="rounded-full bg-[#6b9a51] px-5 py-2 text-sm font-semibold text-white" onClick={() => setOpen(false)}>
              {t("navLogin")}
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
