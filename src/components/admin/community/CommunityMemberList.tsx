import Link from "next/link"
import { Search, Users } from "lucide-react"
import { COMMUNITY_ADMIN_INPUT_CLASS, formatAdminDate, formatProtectedMemberNumber } from "./community-admin-ui"
import type { CommunityAdminMember } from "./types"

function sanctionLabel(member: CommunityAdminMember) {
  if (member.active_sanction_type === "permanent_ban") return "永久封禁"
  if (member.active_sanction_type === "mute") return `限制至 ${formatAdminDate(member.active_sanction_ends_at)}`
  return "正常"
}

function sanctionClass(member: CommunityAdminMember) {
  if (member.active_sanction_type === "permanent_ban") return "bg-destructive/10 text-destructive"
  if (member.active_sanction_type === "mute") return "bg-orange-100 text-orange-700"
  return "bg-emerald-100 text-emerald-700"
}

export function CommunityMemberSearch({
  query,
  canSearchMemberNumber,
}: {
  query?: string
  canSearchMemberNumber: boolean
}) {
  return (
    <form className="flex max-w-md gap-2">
      <label className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          defaultValue={query ?? ""}
          placeholder={canSearchMemberNumber ? "搜索社区昵称或会员编号" : "搜索社区昵称"}
          aria-label={canSearchMemberNumber ? "搜索社区昵称或会员编号" : "搜索社区昵称"}
          className={`${COMMUNITY_ADMIN_INPUT_CLASS} pl-9`}
        />
      </label>
      <button type="submit" className="min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">搜索</button>
    </form>
  )
}

export function CommunityMemberList({
  members,
  canViewMemberNumber,
}: {
  members: CommunityAdminMember[]
  canViewMemberNumber: boolean
}) {
  if (members.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-14 text-center">
        <Users className="mx-auto size-9 text-muted-foreground" />
        <p className="mt-3 font-medium">没有符合条件的社区成员</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {members.map((member) => (
          <Link key={member.profile_id} href={`/admin/community/members/${member.profile_id}`} className="block rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{member.nickname}</h3>
                <p className="mt-1 text-xs text-muted-foreground">会员编号 {formatProtectedMemberNumber(member.member_number, canViewMemberNumber)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${sanctionClass(member)}`}>{sanctionLabel(member)}</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">加入社区：{formatAdminDate(member.joined_at)}</p>
          </Link>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">社区身份</th>
              <th className="px-4 py-3 font-medium">会员编号</th>
              <th className="px-4 py-3 font-medium">会员状态</th>
              <th className="px-4 py-3 font-medium">社区限制</th>
              <th className="px-4 py-3 font-medium">加入社区</th>
              <th className="px-4 py-3"><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((member) => (
              <tr key={member.profile_id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{member.nickname}</td>
                <td className="px-4 py-3">{formatProtectedMemberNumber(member.member_number, canViewMemberNumber)}</td>
                <td className="px-4 py-3 text-muted-foreground">{member.member_status}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${sanctionClass(member)}`}>{sanctionLabel(member)}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatAdminDate(member.joined_at)}</td>
                <td className="px-4 py-3 text-right"><Link href={`/admin/community/members/${member.profile_id}`} className="font-medium text-primary hover:underline">管理</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
