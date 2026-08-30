"use client"

import { useState } from "react"
import { grantScriptAccess, revokeScriptAccess, fetchScriptAccessList } from "@/app/admin/scripts/[id]/actions"
import { Button } from "@/components/ui/button"
import { Shield, X, UserPlus, Loader2 } from "lucide-react"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"

export interface AccessRecord {
  member_id: string
  can_view_full: boolean
  member: { id: string; member_identity: { full_name: string } | null } | null
}

interface Props {
  scriptId: string
  allMembers: { id: string; name: string }[]
  initialAccessList: AccessRecord[]
}

export function ScriptAccessPanel({ scriptId, allMembers, initialAccessList }: Props) {
  const [accessList, setAccessList] = useState<AccessRecord[]>(initialAccessList)
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [auditReason, setAuditReason] = useState("")

  async function loadAccess() {
    setLoading(true)
    try {
      const res = await fetchScriptAccessList(scriptId)
      if (res.error) { setError(res.error); return }
      setError(null)
      setAccessList(res.data as AccessRecord[])
    } finally {
      setLoading(false)
    }
  }

  const authorizedIds = new Set(accessList.map((a) => a.member_id))
  const availableMembers = allMembers.filter((m) => !authorizedIds.has(m.id))

  async function handleGrant() {
    if (selectedIds.length === 0) return
    setGranting(true)
    setError(null)
    const res = await grantScriptAccess(scriptId, selectedIds, auditReason)
    setGranting(false)
    if (res.error) { setError(res.error); return }
    setSelectedIds([])
    await loadAccess()
  }

  async function handleRevoke(memberId: string) {
    setError(null)
    const res = await revokeScriptAccess(scriptId, memberId, auditReason)
    if (res.error) { setError(res.error); return }
    await loadAccess()
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
      {error && <p className="text-xs text-destructive">{error}</p>}

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">本次授权变更理由</span>
        <input
          value={auditReason}
          onChange={(event) => setAuditReason(event.target.value)}
          minLength={4}
          maxLength={500}
          placeholder="必填，4–500 字；写入成员审计"
          className="min-h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>

      {/* 已授权列表 */}
      {accessList.length > 0 && (
        <div className="space-y-1.5">
          {accessList.map((a) => {
            const unwrap = (v: unknown) => Array.isArray(v) ? v[0] : v
            const member = unwrap(a.member) as { member_identity?: { full_name: string } | null } | null
            const identity = unwrap(member?.member_identity) as { full_name: string } | null
            return (
              <div key={a.member_id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-sm">{identity?.full_name ?? a.member_id}</span>
                <button
                  onClick={() => handleRevoke(a.member_id)}
                  disabled={!adminAuditReasonIsValid(auditReason)}
                  className="text-xs text-destructive hover:underline flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
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
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">按住 Ctrl 多选</p>
        </div>
        <Button size="sm" onClick={handleGrant} disabled={granting || selectedIds.length === 0 || !adminAuditReasonIsValid(auditReason)}>
          <UserPlus className="size-4" />
          {granting ? "授权中..." : `授权 (${selectedIds.length})`}
        </Button>
      </div>
    </div>
  )
}
