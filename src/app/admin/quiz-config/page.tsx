import { requireAdmin } from "@/lib/auth/admin"
import { getAdminQuestionnaires } from "@/lib/questionnaires/server"
import { QuestionnaireManager } from "./QuestionnaireManager"

export default async function QuizConfigPage() {
  const admin = await requireAdmin()
  const questionnaires = await getAdminQuestionnaires()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">问卷配置</h1>
        <p className="text-muted-foreground text-sm mt-1">
          管理通用问卷的草稿、预览和发布版本。
        </p>
      </div>
      {questionnaires ? <QuestionnaireManager initialQuestionnaires={questionnaires} canPublish={admin.role === "super_admin"} /> : (
        <div role="status" className="rounded-xl border bg-card p-5">
          <p className="font-medium">问卷管理数据库尚未升级</p>
          <p className="mt-2 text-sm text-muted-foreground">请先应用问卷模板与版本迁移，再使用草稿和发布功能。现有用户问卷继续使用原配置。</p>
        </div>
      )}
    </div>
  )
}
