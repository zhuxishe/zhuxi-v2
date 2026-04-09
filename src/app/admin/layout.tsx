import { headers } from "next/headers"
import { getAdmin, requireAdmin } from "@/lib/auth/admin"
import { AdminSidebar } from "@/components/admin/AdminSidebar"

/** 不需要 admin 保护的路径前缀 */
const PUBLIC_PREFIXES = ["/admin/login"]

/** 从多个 header 源提取 pathname */
async function getPathname(): Promise<string> {
  const h = await headers()
  // Next.js 内部 header（Vercel 部署时可用）
  const fromHeaders = h.get("x-next-pathname") ?? h.get("x-invoke-path")
  if (fromHeaders) return fromHeaders
  // 本地开发 fallback: 从 referer 或 x-url 提取
  const referer = h.get("referer")
  if (referer) {
    try { return new URL(referer).pathname } catch { /* ignore */ }
  }
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
          <AdminSidebar />
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
          <AdminSidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      )
    }
    // 没有 pathname 信息且未登录 → 让 page.tsx 自己处理重定向
    return <>{children}</>
  }

  await requireAdmin()

  return (
    <div className="flex h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
