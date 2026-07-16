import { requireAdmin } from "@/lib/auth/admin"
import { CommunityAdminPage } from "@/components/admin/community/CommunityAdminPage"
import { CommunitySetupWarning } from "@/components/admin/community/CommunitySetupWarning"
import { ModerationFilters, ModerationQueue } from "@/components/admin/community/ModerationQueue"
import type { CommunityReport } from "@/components/admin/community/types"
import { fetchCommunityReports } from "../data"

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminCommunityModerationPage({ searchParams }: PageProps) {
  const raw = await searchParams
  const values = {
    status: first(raw.status),
    reason: first(raw.reason),
    targetType: first(raw.targetType),
    reporter: first(raw.reporter),
    author: first(raw.author),
    from: first(raw.from),
    to: first(raw.to),
  }
  const status = ["pending", "resolved", "dismissed"].includes(values.status ?? "")
    ? values.status as CommunityReport["status"]
    : values.status === "" ? undefined : "pending"
  const reason = ["harassment", "privacy", "spam", "inappropriate", "other"].includes(values.reason ?? "")
    ? values.reason as CommunityReport["reason"]
    : undefined
  const contentType = ["treehole", "photo", "comment", "reply", "profile"].includes(values.targetType ?? "")
    ? values.targetType as "treehole" | "photo" | "comment" | "reply" | "profile"
    : undefined

  const admin = await requireAdmin()
  const result = await fetchCommunityReports({
    status,
    reason,
    contentType,
    reporterMemberNumber: values.reporter,
    targetMemberNumber: values.author,
    from: values.from,
    to: values.to,
  })

  return (
    <CommunityAdminPage
      admin={admin}
      title="统一审核"
      description="集中处理帖子、照片、评论、回复与社区身份举报。举报不会自动隐藏内容。"
    >
      {result.setupRequired ? (
        <CommunitySetupWarning />
      ) : (
        <div className="space-y-4">
          <ModerationFilters values={values} />
          <p className="text-sm text-muted-foreground">显示最近 {result.reports.length} 条记录</p>
          <ModerationQueue reports={result.reports} />
        </div>
      )}
    </CommunityAdminPage>
  )
}
