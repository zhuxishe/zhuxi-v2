import Link from "next/link"
import { COMPOSITE_SCORE_FIELDS } from "@/lib/member-master/composite-scores"
import type { MemberCompositeScores } from "@/types/member-composite-scores"

export function MemberCompositeScoreSummary({ scores }: { scores: MemberCompositeScores }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">综合评分</h3>
        <Link href={`/admin/members/${scores.member_id}/interview`} className="text-sm text-primary hover:underline">编辑评分</Link>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">仅管理员可见，所有管理员共同维护。</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {COMPOSITE_SCORE_FIELDS.map(({ key, label }) => (
          <div key={key} className="rounded-lg bg-muted/40 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-sm font-medium">{scores[key] ?? 3} / 5{scores[key] === null ? <span className="ml-2 font-normal text-muted-foreground">未评分（默认）</span> : null}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
