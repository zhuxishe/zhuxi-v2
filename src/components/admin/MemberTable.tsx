import Link from "next/link"
import type { MemberDirectoryItem } from "@/types"
import { MemberStatusBadge } from "./MemberStatusBadge"
import { memberDisplayLabel } from "./member-center-utils"

interface Props {
  members: MemberDirectoryItem[]
  canViewHighRisk: boolean
  redactedFields: string[]
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "未记录"
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date)
}

function StateBadge({ value, fallback = "未设置" }: { value: string | null; fallback?: string }) {
  const label = value ? memberDisplayLabel(value) : fallback
  const tone = value === "active" || value === "complete" || value === "submitted"
    ? "bg-emerald-50 text-emerald-700"
    : value === "suspended" || value === "rejected"
      ? "bg-rose-50 text-rose-700"
      : "bg-muted text-muted-foreground"
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
}

export function MemberTable({ members, canViewHighRisk, redactedFields }: Props) {
  if (members.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">没有符合条件的用户或成员</p>
  }

  const highRiskVisible = canViewHighRisk && !redactedFields.some((field) => ["member_number", "auth_email", "auth_providers"].some((sensitive) => field.includes(sensitive)))

  return (
    <div className="overflow-x-auto">
      {!highRiskVisible ? (
        <p className="border-b border-border bg-amber-50 px-4 py-2 text-xs text-amber-900">
          权限隐藏：会员编号、登录邮箱与登录方式仅超级管理员可见；这不代表对应业务值为空。
        </p>
      ) : null}
      <table className="w-full min-w-[1180px] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-3 font-medium text-muted-foreground">用户与成员</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">成员主记录 ID（members.id）</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">登录账号绑定</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">来源</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">账号 / 资料 / 审批</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">会员编号</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">更新时间</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.memberId} className="border-b border-border/50 align-top transition-colors hover:bg-muted/30">
              <td className="px-4 py-3">
                <p className="font-medium">{member.fullName ?? "未填写姓名"}</p>
                {member.nickname ? <p className="mt-0.5 text-xs text-muted-foreground">{member.nickname}</p> : null}
                <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground" title={(highRiskVisible ? member.authEmail : member.email) ?? member.email ?? undefined}>
                  {(highRiskVisible ? member.authEmail : null) ?? member.email ?? "未填写业务邮箱"}
                </p>
              </td>
              <td className="px-4 py-3">
                <code className="block max-w-52 break-all text-xs text-muted-foreground" title={member.memberId}>{member.memberId}</code>
              </td>
              <td className="px-4 py-3">
                <StateBadge value={member.authBound === true ? "已绑定" : member.authBound === false ? "未绑定" : null} />
                {highRiskVisible ? (
                  member.authProviders.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">{member.authProviders.join(" / ")}</p> : null
                ) : <p className="mt-1 text-xs text-amber-700">登录方式因权限隐藏</p>}
              </td>
              <td className="px-4 py-3">
                <StateBadge value={member.recordSource} />
                {member.hasLegacyRecord ? <p className="mt-1 text-xs text-muted-foreground">关联历史记录 × {member.legacyRecordCount}</p> : null}
              </td>
              <td className="px-4 py-3">
                <div className="flex max-w-64 flex-wrap gap-1.5">
                  <StateBadge value={member.accountStatus} fallback="账号未设置" />
                  <StateBadge value={member.profileStage} fallback="资料未开始" />
                  <MemberStatusBadge status={member.status} />
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-xs">{highRiskVisible ? member.memberNumber ?? "未分配" : <span className="font-sans text-amber-700">因权限隐藏</span>}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(member.updatedAt)}</td>
              <td className="px-4 py-3 text-right">
                <Link href={`/admin/members/${member.memberId}`} className="font-medium text-primary hover:underline">查看详情</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
