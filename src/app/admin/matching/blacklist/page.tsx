import Link from "next/link"
import { requireAdmin } from "@/lib/auth/admin"
import { createClient } from "@/lib/supabase/server"
import { AdminTopBar } from "@/components/admin/AdminTopBar"

export default async function BlacklistPage() {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from("pair_relationships")
    .select(`
      id, notes, created_at,
      member_a:members!pair_relationships_member_a_id_fkey (
        id, member_identity (full_name)
      ),
      member_b:members!pair_relationships_member_b_id_fkey (
        id, member_identity (full_name)
      )
    `)
    .eq("status", "blacklist")
    .order("created_at", { ascending: false })

  const blacklist = rows ?? []

  return (
    <div>
      <AdminTopBar admin={admin} title="黑名单管理" />
      <div className="p-6 space-y-4">
        {blacklist.length === 0 ? (
          <p className="text-muted-foreground text-sm">暂无黑名单记录</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">成员 A</th>
                  <th className="px-4 py-3 text-left font-medium">成员 B</th>
                  <th className="px-4 py-3 text-left font-medium">原因</th>
                  <th className="px-4 py-3 text-left font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {blacklist.map((row) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const r = row as any
                  const nameA = r.member_a?.member_identity?.full_name ?? "未知"
                  const nameB = r.member_b?.member_identity?.full_name ?? "未知"
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">{nameA}</td>
                      <td className="px-4 py-3">{nameB}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.notes || "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("zh-CN")}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="pt-4">
          <Link
            href="/admin/matching"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            &larr; 返回匹配列表
          </Link>
        </div>
      </div>
    </div>
  )
}
