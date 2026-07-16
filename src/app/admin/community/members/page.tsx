import { requireAdmin } from "@/lib/auth/admin"
import { CommunityAdminPage } from "@/components/admin/community/CommunityAdminPage"
import { CommunityMemberList, CommunityMemberSearch } from "@/components/admin/community/CommunityMemberList"
import { CommunitySetupWarning } from "@/components/admin/community/CommunitySetupWarning"
import { fetchCommunityAdminMembers } from "../data"

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminCommunityMembersPage({ searchParams }: PageProps) {
  const raw = await searchParams
  const qValue = Array.isArray(raw.q) ? raw.q[0] : raw.q
  const query = qValue?.trim().toLocaleLowerCase()
  const admin = await requireAdmin()
  const result = await fetchCommunityAdminMembers()
  const members = query
    ? result.members.filter((member) => member.nickname.toLocaleLowerCase().includes(query) || member.member_number?.toLocaleLowerCase().includes(query))
    : result.members

  return (
    <CommunityAdminPage
      admin={admin}
      title="社区成员"
      description="查看社区身份、昵称历史、内容统计和限制记录。永久封禁仅超级管理员可执行。"
    >
      {result.setupRequired ? (
        <CommunitySetupWarning />
      ) : (
        <div className="space-y-4">
          <CommunityMemberSearch query={qValue} />
          <p className="text-sm text-muted-foreground">显示 {members.length} 位成员</p>
          <CommunityMemberList members={members} />
        </div>
      )}
    </CommunityAdminPage>
  )
}
