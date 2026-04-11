import { requireAdmin } from "@/lib/auth/admin"
import { getQuizConfig } from "@/lib/queries/quiz-config"
import { QuizConfigEditor } from "./QuizConfigEditor"

export default async function QuizConfigPage() {
  await requireAdmin()
  const config = await getQuizConfig()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">问卷配置</h1>
        <p className="text-muted-foreground text-sm mt-1">
          管理ZSP-15人格问卷的题目、计分、维度权重和命名系统
        </p>
      </div>
      <QuizConfigEditor initialConfig={config} />
    </div>
  )
}
