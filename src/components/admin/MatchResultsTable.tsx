"use client"

import { useMemo } from "react"
import { MatchResultRow } from "./MatchResultRow"
import type { EnrichedMatchResult, PairRelationship } from "./match-detail-types"

interface Props {
  results: EnrichedMatchResult[]
  pairRelationships?: PairRelationship[]
  submissionPrefs?: Record<string, { game_type_pref: string; gender_pref: string }>
}

/** Build a lookup key for pair relationship (order-independent) */
function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}||${bId}` : `${bId}||${aId}`
}

export function MatchResultsTable({ results, pairRelationships = [], submissionPrefs = {} }: Props) {
  // Build pair relationship map for O(1) lookup
  const relMap = useMemo(() => {
    const map = new Map<string, PairRelationship>()
    for (const rel of pairRelationships) {
      map.set(pairKey(rel.member_a_id, rel.member_b_id), rel)
    }
    return map
  }, [pairRelationships])

  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">暂无匹配结果</p>
  }

  return (
    <div className="rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">#</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">玩家 A</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">玩家 B</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">学校</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型/时段</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">关系</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">得分</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const aId = r.member_a?.id ?? ""
            const bId = r.member_b?.id ?? ""
            const rel = aId && bId ? relMap.get(pairKey(aId, bId)) : undefined

            return (
              <MatchResultRow
                key={r.id}
                result={r}
                index={i}
                pairRel={rel ?? null}
                submissionPrefs={submissionPrefs}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
