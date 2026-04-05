import { requireAdmin } from "@/lib/auth/admin"
import { AdminTopBar } from "@/components/admin/AdminTopBar"
import { ScriptUploadForm } from "@/components/admin/ScriptUploadForm"

export default async function NewScriptPage() {
  const admin = await requireAdmin()

  return (
    <div>
      <AdminTopBar admin={admin} title="添加剧本" />
      <div className="p-6">
        <ScriptUploadForm />
      </div>
    </div>
  )
}
