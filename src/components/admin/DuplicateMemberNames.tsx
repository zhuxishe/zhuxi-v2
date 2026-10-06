import Link from "next/link"
import type { DuplicateNameGroup } from "@/lib/member-master/duplicate-names"

export function DuplicateMemberNames({ groups }: { groups: DuplicateNameGroup[] | null }) {
  const total = groups?.reduce((sum, group) => sum + group.members.length, 0) ?? 0
  return (
    <section aria-labelledby="duplicate-member-names-title" className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 id="duplicate-member-names-title" className="text-sm font-semibold">重名提醒</h2>
      <p className="mt-1 text-xs text-muted-foreground">检查全部当前成员，不受上方筛选和分页影响；重名不代表同一人。</p>
      {groups === null ? (
        <p role="alert" className="mt-2 text-sm text-amber-700">重名检测暂时不可用，请刷新后重试。</p>
      ) : groups.length === 0 ? (
        <p className="mt-2 text-sm text-emerald-700">当前未发现重名人员</p>
      ) : (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-amber-700">发现 {groups.length} 组重名，涉及 {total} 条成员记录 · 展开核对</summary>
          <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.members[0].id} className="rounded-lg border border-border px-3 py-2">
                <p className="break-words text-sm font-medium">{group.name} <span className="text-xs text-muted-foreground">{group.members.length} 条记录</span></p>
                <ul className="mt-1 space-y-1">
                  {group.members.map((member, index) => (
                    <li key={member.id} className="flex items-start justify-between gap-3 text-xs">
                      <span className="min-w-0 break-words text-muted-foreground">{index + 1}. {member.nickname?.trim() || "未填写昵称"} · {member.schoolName?.trim() || "未填写学校"}</span>
                      <Link href={`/admin/members/${member.id}`} className="shrink-0 text-primary hover:underline" aria-label={`查看${group.name}的第 ${index + 1} 条成员记录`}>查看详情</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}
