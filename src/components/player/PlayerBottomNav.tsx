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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-lg items-center justify-around py-2">
        {NAV_ITEMS.map(({ href, icon: Icon, tKey }) => {
          const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" />
              <span>{t(tKey)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
