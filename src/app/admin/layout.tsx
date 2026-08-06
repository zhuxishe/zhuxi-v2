import { headers } from "next/headers"
import { getAdmin, requireAdmin } from "@/lib/auth/admin"
import { AdminSidebar } from "@/components/admin/AdminSidebar"

/** 不需要 admin 保护的路径前缀 */
const PUBLIC_PREFIXES = ["/admin/login"]

/** 从可信的内部 header 提取当前 pathname */
async function getPathname(): Promise<string> {
  const h = await headers()
  // x-next-pathname 由 src/proxy.ts 注入；x-invoke-path 兼容旧运行时。
  const fromHeaders = h.get("x-next-pathname") ?? h.get("x-invoke-path")
  if (fromHeaders) return fromHeaders
  return ""
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = await getPathname()

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))

  if (isPublic) {
    const admin = await getAdmin()
    if (admin) {
      return (
        <div className="flex h-screen bg-background">
          <AdminSidebar role={admin.role} />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      )
    }
    return <>{children}</>
  }

  // pathname 为空时（header 不可用），先尝试获取 admin，如果没有就显示 children
  // 每个 page.tsx 都有自己的 requireAdmin() 保护
  if (!pathname) {
    const admin = await getAdmin()
    if (admin) {
      return (
        <div className="flex h-screen bg-background">
          <AdminSidebar role={admin.role} />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      )
    }
    // 没有 pathname 信息且未登录 → 让 page.tsx 自己处理重定向
    return <>{children}</>
  }

  const admin = await requireAdmin()

  return (
    <div className="flex h-screen bg-background">
      <AdminSidebar role={admin.role} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
