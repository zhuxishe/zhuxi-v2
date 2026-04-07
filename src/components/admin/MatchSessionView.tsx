"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle } from "lucide-react"
import { MatchPairCard } from "./MatchPairCard"
import { UnmatchedDiagnostics } from "./UnmatchedDiagnostics"
import { TimeSlotHeatmap } from "./TimeSlotHeatmap"
import { lockPair, splitPair, restorePair, confirmSession } from "@/app/admin/matching/[id]/actions"
import type { PairRelationship } from "./match-detail-types"

interface Props {
  session: { id: string; session_name: string | null; status: string; total_candidates: number; total_matched: number; total_unmatched: number }
  results: Array<Record<string, unknown>>
  diagnostics: Array<Record<string, unknown>>
  candidates: Array<{ preferred_time_slots: string[] }>
  pairRelationships?: PairRelationship[]
}

export function MatchSessionView({ session, results, diagnostics, candidates, pairRelationships = [] }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  // Build pair relationship lookup map
  const relMap = useMemo(() => {
    const map = new Map<string, PairRelationship>()
    for (const rel of pairRelationships) {
      const key = rel.member_a_id < rel.member_b_id
        ? `${rel.member_a_id}||${rel.member_b_id}`
        : `${rel.member_b_id}||${rel.member_a_id}`
      map.set(key, rel)
    }
    return map
  }, [pairRelationships])

  const findRel = (aId?: string, bId?: string): PairRelationship | undefined => {
    if (!aId || !bId) return undefined
    const key = aId < bId ? `${aId}||${bId}` : `${bId}||${aId}`
    return relMap.get(key)
  }

  const handleAction = (action: (id: string) => Promise<{ error?: string; success?: boolean }>, id: string) => {
    startTransition(async () => {
      setError("")
      const res = await action(id)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  const handleConfirm = () => {
    startTransition(async () => {
      setError("")
      const res = await confirmSession(session.id)
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="p-6 space-y-6">
      {/* KPI */}
      <div className="flex flex-wrap gap-3">
        <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-medium">
          {session.total_candidates} 人参与
        </span>
        <span className="rounded-full bg-green-500/10 text-green-600 px-3 py-1 text-sm font-medium">
          {session.total_matched} 对匹配
        </span>
        {session.total_unmatched > 0 && (
          <span className="rounded-full bg-orange-500/10 text-orange-600 px-3 py-1 text-sm font-medium">
            {session.total_unmatched} 人未匹配
          </span>
        )}
        {session.status === "draft" && (
          <Button size="sm" onClick={handleConfirm} disabled={isPending}>
            <CheckCircle className="size-3.5" /> 确认发布
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Time slot heatmap */}
      {candidates.length > 0 && <TimeSlotHeatmap candidates={candidates} />}

      {/* Pair cards */}
      <div className="space-y-4">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {results.map((r: any) => (
          <MatchPairCard
            key={r.id}
            result={r}
            pairRel={findRel(r.member_a?.id, r.member_b?.id)}
            onLock={(id) => handleAction(r.status === "locked" ? restorePair : lockPair, id)}
            onSplit={(id) => handleAction(splitPair, id)}
            onRestore={(id) => handleAction(restorePair, id)}
          />
        ))}
      </div>

      {/* Unmatched diagnostics */}
      {diagnostics.length > 0 && (
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        <UnmatchedDiagnostics diagnostics={diagnostics as any} />
      )}
    </div>
  )
}
