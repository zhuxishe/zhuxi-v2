import Link from "next/link"
import { requireAdmin } from "@/lib/auth/admin"
import { parseCommunityContentFilters } from "@/lib/community/admin-content"
import { CommunityAdminPage } from "@/components/admin/community/CommunityAdminPage"
import { CommunityContentFilters } from "@/components/admin/community/CommunityContentFilters"
import { CommunityContentList } from "@/components/admin/community/CommunityContentList"
import { CommunitySetupWarning } from "@/components/admin/community/CommunitySetupWarning"
import { fetchCommunityAdminContent } from "./data"

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function nextHref(raw: Record<string, string | string[] | undefined>, cursor: string) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    if (key === "cursor") continue
    const first = Array.isArray(value) ? value[0] : value
    if (first) params.set(key, first)
  }
  params.set("cursor", cursor)
  return `/admin/community/content?${params.toString()}`
}

export default async function AdminCommunityContentPage({ searchParams }: PageProps) {
  const admin = await requireAdmin()
  const raw = await searchParams
  const filters = parseCommunityContentFilters(raw)
  const result = await fetchCommunityAdminContent(admin.id, filters)

  return (
    <CommunityAdminPage
      admin={admin}
      title="内容管理"
      description="检索并监控树洞、照片动态、评论和回复。匿名作者身份在主动巡查中保持隐藏；管理员不能改写会员原文。"
    >
      {result.setupRequired ? (
        <CommunitySetupWarning />
      ) : (
        <div className="space-y-4">
          <CommunityContentFilters filters={filters} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">本页显示 {result.rows.length} 条，按发布时间倒序</p>
            {filters.cursor ? <Link href="/admin/community/content" className="text-sm font-medium text-primary hover:underline">返回最新内容</Link> : null}
          </div>
          <CommunityContentList rows={result.rows} />
          {result.nextCursor ? (
            <div className="flex justify-center pt-2">
              <Link href={nextHref(raw, result.nextCursor)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-5 text-sm font-medium hover:bg-muted">查看更早内容</Link>
            </div>
          ) : null}
        </div>
      )}
    </CommunityAdminPage>
  )
}
