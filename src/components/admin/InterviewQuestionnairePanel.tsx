import { formatAdminDateTime } from "@/lib/admin-datetime"
import type { QuestionnaireAnswer, QuestionnaireQuestion } from "@/lib/questionnaires/types"
import type { InterviewQuestionnaire } from "@/types/interview-questionnaire"

function answerText(question: QuestionnaireQuestion, answer: QuestionnaireAnswer | undefined): string {
  if (answer === undefined || answer === null || answer === "" || (Array.isArray(answer) && answer.length === 0)) return "未填写"
  const label = (value: string | number | boolean) => {
    const option = question.options?.find((entry) => entry.value === String(value))
    if (option) return option.label.zh || option.label.ja
    if (typeof value === "boolean") return value ? "是" : "否"
    return String(value)
  }
  return Array.isArray(answer) ? answer.map(label).join("、") : label(answer)
}

export function InterviewQuestionnairePanel({ questionnaire }: { questionnaire: InterviewQuestionnaire | null }) {
  const heading = <h2 className="text-lg font-semibold">面试前信息表</h2>
  if (!questionnaire) {
    return <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">{heading}<p role="alert" className="mt-3 text-sm text-destructive">答卷加载失败，请稍后重新打开页面查看。请先保存正在填写的评估。</p></section>
  }
  if (questionnaire.status !== "submitted" && questionnaire.status !== "legacy") {
    const messages = { missing: "暂无面试前信息表记录。", draft: "玩家尚未提交面试前信息表。", unavailable: "该成员已匿名化，答卷内容已清除。" }
    return <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">{heading}<p className="mt-3 text-sm text-muted-foreground">{messages[questionnaire.status]}</p></section>
  }
  const { template, answers, submittedAt } = questionnaire
  return (
    <section aria-label="面试前信息表" className="space-y-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="space-y-2">
        {heading}
        {questionnaire.status === "legacy"
          ? <p className="text-sm text-muted-foreground">历史资料整理。内容来自已有资料，可能包含后续更正。费用免除等后来新增题目的回答，以实际保存的答卷为准。</p>
          : <p className="text-sm text-muted-foreground">第 {questionnaire.version} 版 · 按玩家填写时的题目和选项展示</p>}
        {submittedAt ? <p className="text-xs text-muted-foreground">提交时间（日本时间） {formatAdminDateTime(submittedAt)}</p> : null}
      </div>
      {template.sections.map((section) => {
        const questions = template.questions.filter((question) => question.sectionId === section.id && (question.active || Object.hasOwn(answers, question.id)))
        if (questions.length === 0) return null
        return (
          <details key={section.id} open className="group rounded-lg border border-border">
            <summary className="cursor-pointer px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-primary">{section.title.zh || section.title.ja}</summary>
            <dl className="space-y-4 border-t border-border p-4">
              {questions.map((question) => (
                <div key={question.id} className="space-y-1.5">
                  <dt className="text-sm font-medium">{question.label.zh || question.label.ja}</dt>
                  {question.description && (question.description.zh || question.description.ja) ? <dd className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{question.description.zh || question.description.ja}</dd> : null}
                  <dd className="whitespace-pre-wrap break-words text-sm leading-6">{answerText(question, answers[question.id])}</dd>
                </div>
              ))}
            </dl>
          </details>
        )
      })}
    </section>
  )
}
