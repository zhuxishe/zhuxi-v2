import { notFound, redirect } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchAdminScriptV2 } from "@/lib/queries/admin-scripts"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { ScriptEditForm, type ScriptData } from "@/components/admin/ScriptEditForm"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ notice?: string }>
}

export default async function AdminScriptEditPage({ params, searchParams }: Props) {
  const admin = await requireAdmin()
  const [{ id }, query] = await Promise.all([params, searchParams])

  const script = await fetchAdminScriptV2(id)
  if (!script) notFound()
  if (script.archived_at) redirect(`/admin/scripts/${id}`)

  return (
    <div>
      <AdminTopBar admin={admin} title={`编辑：${script.title}`} />
      <div className="p-6">
        {query.notice === "cover-upload-failed" && (
          <p role="alert" className="mb-4 max-w-lg rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            剧本草稿已创建，但封面上传失败。请在此页重新选择封面并保存，不要重复新建。
          </p>
        )}
        {query.notice === "protected-save-failed" && (
          <p role="alert" className="mb-4 max-w-lg rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            剧本草稿已创建，但完整内容首次保存失败。请在此页检查正文和角色后重新保存，不要重复新建。
          </p>
        )}
        <ScriptEditForm script={{ ...script, roles: script.roles as ScriptData["roles"] }} />
      </div>
    </div>
  )
}
