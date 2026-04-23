"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Users, Shuffle, BookOpen, Calendar, ShieldCheck, LogOut, XCircle, MessageCircle, ClipboardList, UserRound } from "lucide-react"
import { logoutAdmin } from "@/app/admin/login/actions"

const NAV_GROUPS = [
  {
    label: "总览",
    items: [{ href: "/admin", label: "仪表板", icon: LayoutDashboard }],
  },
  {
    label: "运营",
    items: [
      { href: "/admin/members", label: "成员管理", icon: Users },
      { href: "/admin/matching", label: "匹配管理", icon: Shuffle },
      { href: "/admin/matching/cancellations", label: "取消申请", icon: XCircle },
    ],
  },
  {
    label: "内容",
    items: [
      { href: "/admin/scripts", label: "剧本管理", icon: BookOpen },
      { href: "/admin/staff", label: "Staff 管理", icon: UserRound },
      { href: "/admin/testimonials", label: "评论管理", icon: MessageCircle },
      { href: "/admin/activity-records", label: "活动记录", icon: Calendar },
    ],
  },
  {
    label: "系统",
    items: [
      { href: "/admin/quiz-config", label: "问卷配置", icon: ClipboardList },
      { href: "/admin/users", label: "管理员", icon: ShieldCheck },
    ],
  },
]
const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items)

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-screen w-14 md:w-56 flex-col border-r border-border bg-card transition-[width] duration-200">
      <div className="flex h-14 items-center px-3 md:px-4 border-b border-border">
        <span className="heading-display text-base text-primary">竹</span>
        <span className="hidden md:inline heading-display text-base text-primary">溪社</span>
        <span className="hidden md:inline ml-1 text-xs text-muted-foreground">管理</span>
      </div>

      <nav className="flex-1 px-1.5 md:px-2 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            <p className="hidden px-3 pb-1.5 text-[10px] font-semibold text-muted-foreground/70 md:block">{group.label}</p>
            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const isActive = isActivePath(pathname, href)
                return (
                  <Link
                    key={href}
                    href={href}
                    title={label}
                    className={cn(
                      "flex items-center justify-center md:justify-start gap-2 rounded-lg px-2 md:px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="hidden md:inline">{label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
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

function isActivePath(pathname: string | null, href: string) {
  if (href === "/admin") return pathname === "/admin"
  if (!pathname?.startsWith(href)) return false
  return !NAV_ITEMS.some((other) => other.href !== href && other.href.length > href.length && pathname.startsWith(other.href))
}
