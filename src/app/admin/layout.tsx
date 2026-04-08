import { headers } from "next/headers"
import { getAdmin, requireAdmin } from "@/lib/auth/admin"
import { AdminSidebar } from "@/components/admin/AdminSidebar"

/** 不需要 admin 保护的路径前缀 */
const PUBLIC_PREFIXES = ["/admin/login"]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const pathname = headersList.get("x-next-pathname") ?? headersList.get("x-invoke-path") ?? ""

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))

  if (isPublic) {
    // login 等公开页面：尝试获取 admin 信息但不强制
    const admin = await getAdmin()
    if (admin) {
      // 已登录管理员访问 login 页，仍然显示 sidebar
      return (
        <div className="flex h-screen bg-background">
          <AdminSidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      )
    }
    return <>{children}</>
  }

  // 受保护页面：强制要求管理员身份，非管理员自动 redirect 到 /admin/login
  await requireAdmin()

  return (
    <div className="flex h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
