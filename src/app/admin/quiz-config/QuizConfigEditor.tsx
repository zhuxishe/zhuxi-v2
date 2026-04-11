"use client"

import { useState, useTransition } from "react"
import type { QuizConfig } from "@/types/quiz-config"
import { updateQuizConfig } from "./actions"
import { QuestionsTab } from "./QuestionsTab"
import { DimensionsTab } from "./DimensionsTab"
import { TypeLabelsTab } from "./TypeLabelsTab"
import { TypeDescriptionsTab } from "./TypeDescriptionsTab"
import { cn } from "@/lib/utils"
import { Save, Loader2 } from "lucide-react"

const TABS = [
  { key: "questions", label: "题目管理" },
  { key: "dimensions", label: "维度与计分" },
  { key: "labels", label: "命名系统" },
  { key: "descriptions", label: "类型描述" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export function QuizConfigEditor({ initialConfig }: { initialConfig: QuizConfig }) {
  const [config, setConfig] = useState<QuizConfig>(initialConfig)
  const [tab, setTab] = useState<TabKey>("questions")
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState("")

  const handleSave = () => {
    startTransition(async () => {
      setMessage("")
      const result = await updateQuizConfig(config)
      setMessage(result.success ? "保存成功" : `保存失败: ${result.error}`)
    })
  }

  return (
    <div className="space-y-4">
      {/* Tab 切换 + 保存按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                tab === t.key
                  ? "bg-background text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span className={cn("text-sm", message.includes("失败") ? "text-destructive" : "text-green-600")}>
              {message}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存配置
          </button>
        </div>
      </div>

      {/* Tab 内容 */}
      {tab === "questions" && (
        <QuestionsTab
          questions={config.questions}
          onChange={(questions) => setConfig({ ...config, questions })}
        />
      )}
      {tab === "dimensions" && (
        <DimensionsTab
          dimensions={config.dimensions}
          scoring={config.scoring}
          onChange={(dimensions, scoring) => setConfig({ ...config, dimensions, scoring })}
        />
      )}
      {tab === "labels" && (
        <TypeLabelsTab
          typeLabels={config.typeLabels}
          onChange={(typeLabels) => setConfig({ ...config, typeLabels })}
        />
      )}
      {tab === "descriptions" && (
        <TypeDescriptionsTab
          typeDescriptions={config.typeDescriptions}
          onChange={(typeDescriptions) => setConfig({ ...config, typeDescriptions })}
        />
      )}
    </div>
  )
}
