import Link from "next/link"
import type { MemberWithIdentity } from "@/types"
import { MemberStatusBadge } from "./MemberStatusBadge"

interface Props {
  members: MemberWithIdentity[]
}

export function MemberTable({ members }: Props) {
  if (members.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">暂无成员数据</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-4 py-3 font-medium text-muted-foreground">姓名</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">昵称</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">学校</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">状态</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">申请时间</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">操作</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3 font-medium">{m.member_identity?.full_name ?? "-"}</td>
              <td className="px-4 py-3 text-muted-foreground">{m.member_identity?.nickname ?? "-"}</td>
              <td className="px-4 py-3 text-muted-foreground">{m.member_identity?.school_name ?? "-"}</td>
              <td className="px-4 py-3"><MemberStatusBadge status={m.status} /></td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(m.created_at).toLocaleDateString("zh-CN")}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/admin/members/${m.id}`}
                  className="text-primary hover:underline text-xs font-medium"
                >
                  查看
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
