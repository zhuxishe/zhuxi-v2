"use client"

import { useState, useEffect, useCallback } from "react"
import { grantScriptAccess, revokeScriptAccess, fetchScriptAccessList } from "@/app/admin/scripts/[id]/actions"
import { Button } from "@/components/ui/button"
import { Shield, X, UserPlus, Loader2 } from "lucide-react"

interface AccessRecord {
  member_id: string
  can_view_full: boolean
  member: { id: string; member_number: string | null; member_identity: { full_name: string } | null } | null
}

interface Props {
  scriptId: string
  allMembers: { id: string; name: string; memberNumber: string | null }[]
}

export function ScriptAccessPanel({ scriptId, allMembers }: Props) {
  const [accessList, setAccessList] = useState<AccessRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [granting, setGranting] = useState(false)

  const loadAccess = useCallback(async () => {
    const res = await fetchScriptAccessList(scriptId)
    setAccessList(res.data as AccessRecord[])
    setLoading(false)
  }, [scriptId])

  useEffect(() => { loadAccess() }, [loadAccess])

  const authorizedIds = new Set(accessList.map((a) => a.member_id))
  const availableMembers = allMembers.filter((m) => !authorizedIds.has(m.id))

  async function handleGrant() {
    if (selectedIds.length === 0) return
    setGranting(true)
    await grantScriptAccess(scriptId, selectedIds)
    setSelectedIds([])
    setGranting(false)
    loadAccess()
  }

  async function handleRevoke(memberId: string) {
    await revokeScriptAccess(scriptId, memberId)
    loadAccess()
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="size-4 animate-spin" />加载授权列表...</div>
  }

  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">访问权限管理</h3>
        <span className="text-xs text-muted-foreground">({accessList.length} 人已授权)</span>
      </div>

      {/* 已授权列表 */}
      {accessList.length > 0 && (
        <div className="space-y-1.5">
          {accessList.map((a) => {
            const unwrap = (v: unknown) => Array.isArray(v) ? v[0] : v
            const member = unwrap(a.member) as { member_number?: string | null; member_identity?: { full_name: string } | null } | null
            const identity = unwrap(member?.member_identity) as { full_name: string } | null
            return (
              <div key={a.member_id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-sm">{identity?.full_name ?? a.member_id}</span>
                <button onClick={() => handleRevoke(a.member_id)} className="text-xs text-destructive hover:underline flex items-center gap-1">
                  <X className="size-3" /> 撤销
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* 批量授权 */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <select
            multiple
            value={selectedIds}
            onChange={(e) => setSelectedIds(Array.from(e.target.selectedOptions, (o) => o.value))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm h-24"
          >
            {availableMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.memberNumber ?? "-"})</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">按住 Ctrl 多选</p>
        </div>
        <Button size="sm" onClick={handleGrant} disabled={granting || selectedIds.length === 0}>
          <UserPlus className="size-4" />
          {granting ? "授权中..." : `授权 (${selectedIds.length})`}
        </Button>
      </div>
    </div>
  )
}
