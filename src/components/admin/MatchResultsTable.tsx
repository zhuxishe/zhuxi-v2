"use client"

interface MatchResult {
  id: string
  total_score: number
  best_slot: string | null
  rank: number | null
  score_breakdown: unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  member_a: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  member_b: any
}

interface Props {
  results: MatchResult[]
}

function getMemberName(member: { member_identity?: { full_name?: string; nickname?: string } } | null) {
  if (!member?.member_identity) return "未知"
  return member.member_identity.full_name ?? member.member_identity.nickname ?? "未知"
}

function getSchool(member: { member_identity?: { school_name?: string } } | null) {
  return member?.member_identity?.school_name ?? "-"
}

export function MatchResultsTable({ results }: Props) {
  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">暂无匹配结果</p>
  }

  return (
    <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">#</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">玩家 A</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">玩家 B</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">学校</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">得分</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
              <td className="px-4 py-3 text-muted-foreground">{r.rank ?? i + 1}</td>
              <td className="px-4 py-3 font-medium">{getMemberName(r.member_a)}</td>
              <td className="px-4 py-3 font-medium">{getMemberName(r.member_b)}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">
                {getSchool(r.member_a)} / {getSchool(r.member_b)}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-bold">
                  {typeof r.total_score === "number" ? r.total_score.toFixed(1) : r.total_score}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
