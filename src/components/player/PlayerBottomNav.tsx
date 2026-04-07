"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { Home, User, Users, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/app", icon: Home, tKey: "home" },
  { href: "/app/profile", icon: User, tKey: "profile" },
  { href: "/app/matches", icon: Users, tKey: "matches" },
  { href: "/app/scripts", icon: BookOpen, tKey: "scripts" },
] as const

interface Props {
  playerName: string
}

export function PlayerBottomNav({ playerName: _playerName }: Props) {
  const pathname = usePathname()
  const t = useTranslations("nav")

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md shadow-[0_-2px_12px_oklch(0.18_0.02_45/6%)]">
      <div className="mx-auto flex max-w-lg items-center justify-around pb-[env(safe-area-inset-bottom)] pt-1.5 pb-2">
        {NAV_ITEMS.map(({ href, icon: Icon, tKey }) => {
          const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-4 py-2 text-[11px] tracking-wide transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-[22px]" strokeWidth={active ? 2 : 1.5} />
              <span className="font-medium">{t(tKey)}</span>
              {active && (
                <span className="absolute top-0.5 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full bg-sakura" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
