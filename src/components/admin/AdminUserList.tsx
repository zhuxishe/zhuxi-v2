"use client"

import { useState, useEffect } from "react"
import { addAdminWhitelist, removeAdmin, fetchAdminList } from "@/app/admin/users/actions"
import { Button } from "@/components/ui/button"
import { Trash2, UserPlus, Shield, ShieldCheck } from "lucide-react"

interface AdminRow {
  id: string
  email: string
  name: string
  role: string
  user_id: string | null
  created_at: string
}

export function AdminUserList() {
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadList() }, [])

  async function loadList() {
    const result = await fetchAdminList()
    if (result.data) setAdmins(result.data)
  }

  async function handleAdd() {
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    const result = await addAdminWhitelist(email.trim())
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setEmail("")
    loadList()
  }

  async function handleRemove(id: string, adminEmail: string) {
    if (!confirm(`确定删除管理员 ${adminEmail}？`)) return
    const result = await removeAdmin(id)
    if (result.error) { setError(result.error); return }
    loadList()
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">管理员白名单</h1>
        <p className="text-sm text-muted-foreground mt-1">
          添加邮箱后，该邮箱可通过 Google 登录管理后台
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="输入邮箱地址"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <Button onClick={handleAdd} disabled={loading} size="sm">
          <UserPlus className="size-4 mr-1" />
          {loading ? "添加中..." : "添加"}
        </Button>
      </div>
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
                  <span className="inline-flex items-center gap-1 text-xs">
                    {a.role === "super_admin"
                      ? <><ShieldCheck className="size-3" /> 超级管理员</>
                      : <><Shield className="size-3" /> 管理员</>}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {a.user_id ? (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">已激活</span>
                  ) : (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">待登录</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRemove(a.id, a.email)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    title="删除"
                  >
                    <Trash2 className="size-4" />
                  </button>
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
