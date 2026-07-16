"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { CalendarDays, Home, MessageSquareText, Sparkles, User } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "/app", icon: Home, tKey: "home" },
  { href: "/app/scripts", icon: CalendarDays, tKey: "scripts" },
  { href: "/app/matches", icon: Sparkles, tKey: "matches" },
  { href: "/app/community", icon: MessageSquareText, tKey: "community" },
  { href: "/app/profile", icon: User, tKey: "profile" },
] as const

function isPathWithin(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function isNavItemActive(pathname: string, href: (typeof NAV_ITEMS)[number]["href"]) {
  if (href === "/app") return pathname === "/app"
  if (href === "/app/matches") {
    return isPathWithin(pathname, "/app/matches") || isPathWithin(pathname, "/app/matching")
  }
  return isPathWithin(pathname, href)
}

interface Props {
  playerName: string
}

export function PlayerBottomNav({ playerName: _playerName }: Props) {
  const pathname = usePathname()
  const t = useTranslations("nav")

  return (
    <nav aria-label="main navigation" className="player-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto grid w-full max-w-md grid-cols-5 items-end pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-1.5">
        {NAV_ITEMS.map(({ href, icon: Icon, tKey }) => {
          const active = isNavItemActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-label={t(tKey)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-1 text-[10px] tracking-normal transition-colors min-[390px]:text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full transition-colors",
                  active && "bg-primary/10"
                )}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2 : 1.5} />
              </span>
              <span className={cn("max-w-full truncate", active ? "font-semibold" : "font-medium")}>
                {t(tKey)}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
