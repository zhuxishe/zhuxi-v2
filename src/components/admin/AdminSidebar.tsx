"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Users, Shuffle, BookOpen, LogOut } from "lucide-react"
import { logoutAdmin } from "@/app/admin/login/actions"

const NAV_ITEMS = [
  { href: "/admin", label: "仪表板", icon: LayoutDashboard },
  { href: "/admin/members", label: "成员管理", icon: Users },
  { href: "/admin/matching", label: "匹配管理", icon: Shuffle },
  { href: "/admin/scripts", label: "剧本管理", icon: BookOpen },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center px-4 border-b border-border">
        <span className="text-base font-bold text-primary">竹溪社</span>
        <span className="ml-1 text-xs text-muted-foreground">管理</span>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border p-2">
        <form action={logoutAdmin}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="size-4" />
            退出登录
          </button>
        </form>
      </div>
    </aside>
  )
}
