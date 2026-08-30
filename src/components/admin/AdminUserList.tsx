"use client"

import { useState } from "react"
import { addAdminWhitelist, removeAdmin, fetchAdminList, updateAdminRole } from "@/app/admin/users/actions"
import { Button } from "@/components/ui/button"
import { Trash2, UserPlus, Shield, ShieldCheck } from "lucide-react"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"

interface AdminRow {
  id: string
  email: string
  name: string
  role: string
  user_id: string | null
  created_at: string
}

interface Props {
  initialAdmins: AdminRow[]
}

export function AdminUserList({ initialAdmins }: Props) {
  const [admins, setAdmins] = useState<AdminRow[]>(initialAdmins)
  const [email, setEmail] = useState("")
  const [newRole, setNewRole] = useState<"admin" | "super_admin">("admin")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [auditReason, setAuditReason] = useState("")

  async function loadList() {
    const result = await fetchAdminList()
    if (result.data) setAdmins(result.data)
  }

  async function handleAdd() {
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    const result = await addAdminWhitelist(email.trim(), newRole, auditReason)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setEmail("")
    setAuditReason("")
    await loadList()
  }

  async function handleRemove(id: string) {
    const result = await removeAdmin(id, auditReason)
    if (result.error) { setError(result.error); return }
    setAuditReason("")
    await loadList()
  }

  async function handleRoleChange(id: string, role: "admin" | "super_admin") {
    setLoading(true)
    setError(null)
    const result = await updateAdminRole(id, role, auditReason)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setAuditReason("")
    await loadList()
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">管理员白名单</h1>
        <p className="text-sm text-muted-foreground mt-1">
          添加邮箱后，该邮箱可通过 Google 登录管理后台
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="输入邮箱地址"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <select
          value={newRole}
          onChange={(event) => setNewRole(event.target.value as "admin" | "super_admin")}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          aria-label="新管理员角色"
        >
          <option value="admin">管理员</option>
          <option value="super_admin">超级管理员</option>
        </select>
        <Button
          onClick={handleAdd}
          disabled={loading || !adminAuditReasonIsValid(auditReason)}
          size="sm"
        >
          <UserPlus className="size-4 mr-1" />
          {loading ? "添加中..." : "添加"}
        </Button>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">本次管理员变更理由</span>
        <input
          value={auditReason}
          onChange={(event) => setAuditReason(event.target.value)}
          minLength={4}
          maxLength={500}
          required
          placeholder="必填，4–500 字；新增、角色变更或删除均写入不可覆盖审计"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">邮箱</th>
              <th className="px-4 py-3 text-left font-medium">角色</th>
              <th className="px-4 py-3 text-left font-medium">状态</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {admins.map((a) => (
              <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">{a.email}</td>
                <td className="px-4 py-3">
                  <label className="inline-flex items-center gap-1 text-xs">
                    {a.role === "super_admin" ? <ShieldCheck className="size-3" /> : <Shield className="size-3" />}
                    <select
                      value={a.role}
                      onChange={(event) => handleRoleChange(a.id, event.target.value as "admin" | "super_admin")}
                      disabled={loading || !adminAuditReasonIsValid(auditReason)}
                      className="rounded border border-border bg-background px-1.5 py-1 text-xs"
                      aria-label={`${a.email} 的管理员角色`}
                    >
                      <option value="admin">管理员</option>
                      <option value="super_admin">超级管理员</option>
                    </select>
                  </label>
                </td>
                <td className="px-4 py-3">
                  {a.user_id ? (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">已激活</span>
                  ) : (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">待登录</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {confirmId === a.id ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        onClick={() => { handleRemove(a.id); setConfirmId(null) }}
                        disabled={!adminAuditReasonIsValid(auditReason)}
                        className="text-xs text-destructive font-medium hover:underline"
                      >确认</button>
                      <span className="text-muted-foreground">/</span>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-xs text-muted-foreground hover:underline"
                      >取消</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmId(a.id)}
                      disabled={!adminAuditReasonIsValid(auditReason)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      title="删除"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">暂无管理员</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
