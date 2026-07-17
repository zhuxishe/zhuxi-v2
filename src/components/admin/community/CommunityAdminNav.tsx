"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BellRing, CircleHelp, Files, LayoutDashboard, ShieldAlert, Users } from "lucide-react"
import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/admin/community", label: "概览", icon: LayoutDashboard },
  { href: "/admin/community/announcements", label: "公告", icon: BellRing },
  { href: "/admin/community/qa", label: "问答", icon: CircleHelp },
  { href: "/admin/community/content", label: "内容", icon: Files },
  { href: "/admin/community/moderation", label: "审核", icon: ShieldAlert },
  { href: "/admin/community/members", label: "成员", icon: Users },
] as const

function isActive(pathname: string, href: string) {
  if (href === "/admin/community") return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function CommunityAdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="社区管理" className="border-b border-border bg-card px-3 sm:px-6">
      <div className="flex gap-1 overflow-x-auto py-2 scrollbar-none">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
