import { notFound } from "next/navigation"
import { requireAdmin } from "@/lib/auth/admin"
import { fetchScript } from "@/lib/queries/scripts"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { ScriptEditForm, type ScriptData } from "@/components/admin/ScriptEditForm"

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminScriptEditPage({ params }: Props) {
  const admin = await requireAdmin()
  const { id } = await params

  let script
  try {
    script = await fetchScript(id)
  } catch {
    notFound()
  }

  return (
    <div>
      <AdminTopBar admin={admin} title={`编辑: ${script.title}`} />
      <div className="p-6">
        <ScriptEditForm script={{ ...script, roles: script.roles as ScriptData["roles"] }} />
      </div>
    </div>
  )
}
