"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle, UserPlus, RefreshCw, Search } from "lucide-react"
import { MatchPairCard } from "./MatchPairCard"
import { UnmatchedDiagnostics } from "./UnmatchedDiagnostics"
import { TimeSlotHeatmap } from "./TimeSlotHeatmap"
import { RematchPool } from "./RematchPool"
import { ManualPairDialog } from "./ManualPairDialog"
import { lockPair, splitPair, restorePair, confirmSession, deleteSession } from "@/app/admin/matching/[id]/actions"
import type { EnrichedMatchResult, PairRelationship, EnrichedMember } from "./match-detail-types"
import type { PoolMember } from "@/lib/queries/pool-members"
import type { DiagnosticItem } from "./UnmatchedDiagnostics"

interface Props {
  session: { id: string; session_name: string | null; status: string; total_candidates: number; total_matched: number; total_unmatched: number; round_id?: string | null }
  results: EnrichedMatchResult[]
  diagnostics: DiagnosticItem[]
  candidates: Array<{ preferred_time_slots: string[] }>
  pairRelationships?: PairRelationship[]
  poolMembers?: PoolMember[]
  allMemberOptions?: { id: string; name: string }[]
  submissionPrefs?: Record<string, { game_type_pref: string; gender_pref: string }>
}

/** 从 EnrichedMember 提取名字 */
function memberName(m: EnrichedMember | null): string {
  return m?.member_identity?.full_name ?? m?.member_identity?.nickname ?? ""
}

/** 检查配对是否匹配搜索词 */
function matchesSearch(r: EnrichedMatchResult, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  if (memberName(r.member_a).toLowerCase().includes(q)) return true
  if (memberName(r.member_b).toLowerCase().includes(q)) return true
  // 多人组
  if (r.group_member_details) {
    for (const m of r.group_member_details) {
      if (memberName(m as EnrichedMember).toLowerCase().includes(q)) return true
    }
  }
  return false
}

export function MatchSessionView({ session, results, diagnostics, candidates, pairRelationships = [], poolMembers = [], allMemberOptions = [], submissionPrefs = {} }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [showFreeManual, setShowFreeManual] = useState(false)
  const [preselectedA, setPreselectedA] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

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

  // 排序：活跃配对在前，已取消的放最后
  const sortedResults = useMemo(() => {
    const active = results.filter((r) => r.status !== "cancelled")
    const cancelled = results.filter((r) => r.status === "cancelled")
    return [...active, ...cancelled]
  }, [results])

  // 搜索过滤
  const filteredResults = useMemo(() => {
    return sortedResults.filter((r) => matchesSearch(r, searchQuery))
  }, [sortedResults, searchQuery])

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

  const handleManualPairFromUnmatched = (memberId: string) => {
    setPreselectedA(memberId)
    setShowFreeManual(true)
  }

  return (
    <div className="p-6 space-y-6">
      {/* KPI */}
      <div className="flex flex-wrap gap-3">
        <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-medium">
          {session.total_candidates} 人参与
        </span>
        <span className="rounded-full bg-green-500/10 text-green-600 px-3 py-1 text-sm font-medium">
          {session.total_matched} 人已匹配
        </span>
        {session.total_unmatched > 0 && (
          <span className="rounded-full bg-orange-500/10 text-orange-600 px-3 py-1 text-sm font-medium">
            {session.total_unmatched} 人未匹配
          </span>
        )}
        {allMemberOptions.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => { setPreselectedA(""); setShowFreeManual(true) }}>
            <UserPlus className="size-3.5" /> 手动配对
          </Button>
        )}
        {session.status === "draft" && (
          <>
            <Button size="sm" variant="outline" onClick={() => {
              if (!confirm("确定要删除当前结果并重新匹配？")) return
              startTransition(async () => {
                setError("")
                const res = await deleteSession(session.id)
                if (res.error) setError(res.error)
                else {
                  const target = session.round_id
                    ? `/admin/matching/rounds/${session.round_id}`
                    : "/admin/matching"
                  router.push(target)
                }
              })
            }} disabled={isPending}>
              <RefreshCw className="size-3.5" /> 重新匹配
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={isPending}>
              <CheckCircle className="size-3.5" /> 确认发布
            </Button>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Time slot heatmap */}
      {candidates.length > 0 && <TimeSlotHeatmap candidates={candidates} />}

      {/* Search bar */}
      {results.length > 6 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索成员姓名..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary"
          />
          {searchQuery && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {filteredResults.length}/{results.length}
            </span>
          )}
        </div>
      )}

      {/* Pair cards — active first, cancelled at bottom */}
      <div className="space-y-4">
        {filteredResults.map((r) => (
          <MatchPairCard
            key={r.id}
            result={r}
            pairRel={findRel(r.member_a?.id, r.member_b?.id)}
            submissionPrefs={submissionPrefs}
            onLock={(id) => handleAction(r.status === "locked" ? restorePair : lockPair, id)}
            onSplit={(id) => handleAction(splitPair, id)}
            onRestore={(id) => handleAction(restorePair, id)}
          />
        ))}
      </div>

      {/* Rematch pool */}
      <RematchPool
        sessionId={session.id}
        poolMembers={poolMembers}
        submissionPrefs={submissionPrefs}
        onRefresh={() => router.refresh()}
      />

      {/* Unmatched diagnostics */}
      {diagnostics.length > 0 && (
        <UnmatchedDiagnostics
          diagnostics={diagnostics}
          submissionPrefs={submissionPrefs}
          onManualPair={handleManualPairFromUnmatched}
        />
      )}

      {/* Manual pair dialog — supports 2-6 members */}
      <ManualPairDialog
        open={showFreeManual}
        onOpenChange={setShowFreeManual}
        sessionId={session.id}
        poolMembers={allMemberOptions}
        preselectedA={preselectedA}
        onPaired={() => { setShowFreeManual(false); router.refresh() }}
      />
    </div>
  )
}
