"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Users, Shuffle, BookOpen, Calendar, ShieldCheck, LogOut, XCircle } from "lucide-react"
import { logoutAdmin } from "@/app/admin/login/actions"

const NAV_ITEMS = [
  { href: "/admin", label: "仪表板", icon: LayoutDashboard },
  { href: "/admin/members", label: "成员管理", icon: Users },
  { href: "/admin/matching", label: "匹配管理", icon: Shuffle },
  { href: "/admin/matching/cancellations", label: "取消申请", icon: XCircle },
  { href: "/admin/scripts", label: "剧本管理", icon: BookOpen },
  { href: "/admin/activity-records", label: "活动记录", icon: Calendar },
  { href: "/admin/users", label: "管理员", icon: ShieldCheck },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-14 md:w-56 flex-col border-r border-border bg-card transition-[width] duration-200">
      <div className="flex h-14 items-center px-3 md:px-4 border-b border-border">
        <span className="heading-display text-base text-primary">竹</span>
        <span className="hidden md:inline heading-display text-base text-primary">溪社</span>
        <span className="hidden md:inline ml-1 text-xs text-muted-foreground">管理</span>
      </div>

      <nav className="flex-1 px-1.5 md:px-2 py-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin"
            ? pathname === "/admin"
            : pathname?.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "flex items-center justify-center md:justify-start gap-2 rounded-lg px-2 md:px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="hidden md:inline">{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border p-1.5 md:p-2">
        <form action={logoutAdmin}>
          <button
            type="submit"
            title="退出登录"
            className="flex w-full items-center justify-center md:justify-start gap-2 rounded-lg px-2 md:px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="size-4 shrink-0" />
            <span className="hidden md:inline">退出登录</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
