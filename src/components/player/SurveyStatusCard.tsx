import Link from "next/link"
import { ClipboardCheck, Clock } from "lucide-react"

interface Props {
  roundName: string
  surveyEnd: string
  hasSubmitted: boolean
}

export function SurveyStatusCard({ roundName, surveyEnd, hasSubmitted }: Props) {
  const deadline = new Date(surveyEnd)
  const now = new Date()
  const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))

  return (
    <Link href="/app/matching/survey">
      <div className={`rounded-xl p-4 ring-1 transition-all ${
        hasSubmitted
          ? "bg-green-50 ring-green-200 dark:bg-green-950/20 dark:ring-green-800"
          : "bg-primary/5 ring-primary/30 hover:ring-primary/50"
      }`}>
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${hasSubmitted ? "bg-green-100 dark:bg-green-900/40" : "bg-primary/10"}`}>
            <ClipboardCheck className={`size-5 ${hasSubmitted ? "text-green-600" : "text-primary"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{roundName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasSubmitted ? "已提交问卷 · 点击修改" : "新一期匹配开始了！点击填写问卷"}
            </p>
          </div>
          {!hasSubmitted && daysLeft > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Clock className="size-3" />
              <span>还剩 {daysLeft} 天</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
