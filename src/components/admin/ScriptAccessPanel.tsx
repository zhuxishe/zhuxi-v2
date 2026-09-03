"use client"

import { useState } from "react"
import { grantScriptAccess, revokeScriptAccess, fetchScriptAccessList } from "@/app/admin/scripts/[id]/actions"
import { Button } from "@/components/ui/button"
import { Shield, X, UserPlus, Loader2 } from "lucide-react"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"

export interface AccessRecord {
  member_id: string
  can_view_full: boolean
  granted_at: string | null
  expires_at: string | null
  revoked_at: string | null
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
  const [expiresAt, setExpiresAt] = useState(() => toDateTimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)))

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

  const authorizedIds = new Set(accessList.filter(isActiveAccess).map((a) => a.member_id))
  const availableMembers = allMembers.filter((m) => !authorizedIds.has(m.id))
  const activeCount = accessList.filter(isActiveAccess).length

  async function handleGrant() {
    if (selectedIds.length === 0) return
    const expiration = new Date(expiresAt)
    if (!Number.isFinite(expiration.getTime())) {
      setError("请选择有效的到期时间")
      return
    }
    setGranting(true)
    setError(null)
    const res = await grantScriptAccess(scriptId, selectedIds, expiration.toISOString(), auditReason)
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
        <span className="text-xs text-muted-foreground">({activeCount} 人当前有效)</span>
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

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">授权到期时间</span>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
          className="min-h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-primary/30"
        />
        <span className="block text-xs text-muted-foreground">默认 7 天，最长 366 天；到期后自动失效。</span>
      </label>

      {/* 已授权列表 */}
      {accessList.length > 0 && (
        <div className="space-y-1.5">
          {accessList.map((a) => {
            const unwrap = (v: unknown) => Array.isArray(v) ? v[0] : v
            const member = unwrap(a.member) as { member_identity?: { full_name: string } | null } | null
            const identity = unwrap(member?.member_identity) as { full_name: string } | null
            const active = isActiveAccess(a)
            const state = a.revoked_at ? "已撤销" : active ? "有效" : "已到期"
            return (
              <div key={a.member_id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-sm">
                  <span className="font-medium">{identity?.full_name ?? a.member_id}</span>
                  <span className={`ml-2 text-xs ${active ? "text-emerald-700" : "text-muted-foreground"}`}>{state}</span>
                  {a.expires_at && <span className="mt-0.5 block text-xs text-muted-foreground">到期：{formatDateTime(a.expires_at)}</span>}
                </span>
                {active && (
                  <button
                    onClick={() => handleRevoke(a.member_id)}
                    disabled={!adminAuditReasonIsValid(auditReason)}
                    className="text-xs text-destructive hover:underline flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="size-3" /> 撤销
                  </button>
                )}
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
          <p className="text-xs text-muted-foreground mt-1">按住 Command（macOS）或 Ctrl（Windows）可多选</p>
        </div>
        <Button size="sm" onClick={handleGrant} disabled={granting || selectedIds.length === 0 || !expiresAt || !adminAuditReasonIsValid(auditReason)}>
          <UserPlus className="size-4" />
          {granting ? "授权中..." : `授权 (${selectedIds.length})`}
        </Button>
      </div>
    </div>
  )
}

function isActiveAccess(record: AccessRecord) {
  return record.can_view_full
    && !record.revoked_at
    && Boolean(record.expires_at)
    && new Date(record.expires_at!).getTime() > Date.now()
}

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value))
}
