"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Eye, FileText, Plus, Save, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { QuestionnairePreview } from "@/components/player/QuestionnaireFields"
import type { AdminQuestionnaire, QuestionnaireKind, QuestionnaireQuestion } from "@/lib/questionnaires/types"
import { validateTemplate } from "@/lib/questionnaires/validation"
import { DimensionsTab } from "./DimensionsTab"
import { TypeLabelsTab } from "./TypeLabelsTab"
import { TypeDescriptionsTab } from "./TypeDescriptionsTab"
import { TemplateQuestionEditor } from "./TemplateQuestionEditor"
import { publishTemplate, saveTemplateDraft } from "./actions"

const NAMES: Record<QuestionnaireKind, string> = { interview: "面试前信息表", supplementary: "补充资料", personality: "性格自评", quiz: "社交人格测试" }
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const copy = <T,>(value: T): T => structuredClone(value)
const currentTemplate = (item: AdminQuestionnaire) => item.draft ?? item.published ?? item.baseline
function actionError(error: string) {
  if (error === "QUESTIONNAIRE_REVISION_CONFLICT") return "配置已被其他管理员更新。请先另行保留当前修改，再刷新页面重新编辑。"
  if (error === "QUESTIONNAIRE_PERMISSION_DENIED") return "当前账号没有执行此操作的权限。"
  if (error === "QUESTIONNAIRE_SCHEMA_UNAVAILABLE") return "问卷数据库尚未升级，请联系维护人员。"
  if (error === "QUESTIONNAIRE_INVALID_INPUT") return "问题配置未通过校验，请检查题目、选项和必要规则。"
  return "操作失败，请稍后重试。"
}

export function QuestionnaireManager({ initialQuestionnaires, canPublish }: { initialQuestionnaires: AdminQuestionnaire[]; canPublish: boolean }) {
  const [items, setItems] = useState(initialQuestionnaires)
  const [kind, setKind] = useState<QuestionnaireKind>(initialQuestionnaires[0]?.kind ?? "interview")
  const [template, setTemplate] = useState(() => copy(currentTemplate(initialQuestionnaires[0])))
  const [locale, setLocale] = useState<"zh" | "ja">("zh")
  const [preview, setPreview] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const item = items.find((entry) => entry.kind === kind)!
  const dirty = !equal(template, currentTemplate(item))
  const hasUnpublishedChanges = !equal(item.draft, item.published)

  function select(next: AdminQuestionnaire) {
    if (pending || next.kind === kind) return
    if (dirty && !window.confirm("当前有未保存的草稿修改，切换后会丢弃这些修改。是否切换？")) return
    setKind(next.kind); setTemplate(copy(currentTemplate(next))); setMessage(null); setPreview(false); setAdvanced(false)
  }
  function updated(next: AdminQuestionnaire) {
    setItems((previous) => previous.map((entry) => entry.kind === next.kind ? next : entry))
    setTemplate(copy(currentTemplate(next)))
  }
  function changeQuestion(id: string, question: QuestionnaireQuestion) {
    setTemplate((previous) => ({ ...previous, questions: previous.questions.map((entry) => entry.id === id ? question : entry) }))
  }
  function moveQuestion(id: string, offset: number) {
    setTemplate((previous) => {
      const questions = [...previous.questions]
      const from = questions.findIndex((question) => question.id === id)
      const sectionQuestions = questions.filter((question) => question.sectionId === questions[from]?.sectionId)
      const target = sectionQuestions[sectionQuestions.findIndex((question) => question.id === id) + offset]
      if (!target) return previous
      const to = questions.findIndex((question) => question.id === target.id)
      ;[questions[from], questions[to]] = [questions[to], questions[from]]
      return { ...previous, questions }
    })
  }
  function addQuestion(sectionId: string) {
    const id = `custom_${crypto.randomUUID()}`
    setTemplate((previous) => ({ ...previous, questions: [...previous.questions, { id, sectionId, type: "text", label: { zh: "", ja: "" }, description: { zh: "", ja: "" }, required: false, active: true, locked: false, maxLength: 200 }] }))
    setPreview(false)
  }
  function save() {
    const validated = validateTemplate(template, currentTemplate(item))
    if (!validated.ok) { setMessage({ error: true, text: validated.error }); return }
    startTransition(async () => {
      setMessage(null)
      try {
        const result = await saveTemplateDraft(kind, item.revision, validated.data)
        if (result.success) { updated(result.draft); setMessage({ error: false, text: "草稿已保存，用户端暂不受影响" }) }
        else setMessage({ error: true, text: actionError(result.error) })
      } catch { setMessage({ error: true, text: "草稿保存失败，请稍后重试" }) }
    })
  }
  function publish() {
    if (!canPublish || dirty || !hasUnpublishedChanges) return
    startTransition(async () => {
      setMessage(null)
      try {
        const result = await publishTemplate(kind, item.revision)
        if (result.success) { updated(result.draft); setMessage({ error: false, text: "新版本已发布。已有答卷保留原版本，新填写使用本次发布版本。" }) }
        else setMessage({ error: true, text: actionError(result.error) })
      } catch { setMessage({ error: true, text: "发布失败，请稍后重试" }) }
    })
  }

  return <div className="space-y-6">
    <nav aria-label="选择通用问卷" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((entry) => <button key={entry.kind} type="button" onClick={() => select(entry)} disabled={pending} aria-pressed={kind === entry.kind} className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${kind === entry.kind ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50"}`}>
        <span className="flex items-center gap-2 text-sm font-semibold"><FileText className="size-4" />{NAMES[entry.kind]}</span>
        <span className="mt-2 block text-xs text-muted-foreground">{currentTemplate(entry).questions.filter((question) => question.active).length} 道启用题目 · {equal(entry.draft, entry.published) ? "与发布版一致" : "有待发布草稿"}</span>
      </button>)}
    </nav>
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4">
      <div><h2 className="font-semibold">{NAMES[kind]}</h2><p className="mt-1 text-xs text-muted-foreground">{template.questions.filter((question) => question.active).length} 道启用题目 · 草稿修订 {item.revision} · 原有答卷不会因发布新题而改变</p></div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => setPreview(!preview)}><Eye />{preview ? "返回编辑" : "预览问卷"}</Button>
        <Button type="button" disabled={pending || !dirty} onClick={save}><Save />{pending ? "处理中…" : "保存草稿"}</Button>
        {canPublish && <Button type="button" variant="outline" disabled={pending || dirty || !hasUnpublishedChanges} onClick={publish}><Send />发布新版本</Button>}
      </div>
      {!canPublish && <p className="w-full text-xs text-muted-foreground">你可以编辑并保存草稿，发布由超级管理员完成。</p>}
      {dirty && <p className="w-full text-xs text-muted-foreground">当前修改尚未保存。保存草稿后才可发布。</p>}
    </div>
    {message && <p role={message.error ? "alert" : "status"} className={`rounded-lg p-3 text-sm ${message.error ? "bg-destructive/5 text-destructive" : "bg-primary/5 text-primary"}`}>{!message.error && <CheckCircle2 className="mr-2 inline size-4" />}{message.text}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs text-muted-foreground">编辑语言</span>
      {(["zh", "ja"] as const).map((value) => <Button key={value} type="button" size="sm" variant={locale === value ? "default" : "outline"} disabled={pending} onClick={() => setLocale(value)}>{value === "zh" ? "中文" : "日文"}</Button>)}
      <p className="text-xs text-muted-foreground">新增文字默认同步为另一语言，可切换后分别修改。题目停用后保留历史。</p>
    </div>
    {preview ? <section className="rounded-xl border bg-muted/20 p-4 sm:p-6"><p className="mb-4 text-xs text-muted-foreground">本地预览，可试填；不会保存为成员答卷，也不会发布。</p><QuestionnairePreview key={`${kind}-${locale}`} template={template} locale={locale} /></section>
      : <fieldset disabled={pending} className="space-y-6">
        {template.sections.map((section) => {
          const questions = template.questions.filter((question) => question.sectionId === section.id)
          return <section key={section.id} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">{section.title[locale] || section.title.zh}</h3><Button type="button" variant="outline" size="sm" disabled={template.questions.length >= 100} onClick={() => addQuestion(section.id)}><Plus />新增问题</Button></div>
            {questions.map((question, index) => <TemplateQuestionEditor key={question.id} question={question} kind={kind} savedOptionIds={currentTemplate(item).questions.find((entry) => entry.id === question.id)?.options?.map((option) => option.id) ?? []} index={index} count={questions.length} locale={locale} onChange={(next) => changeQuestion(question.id, next)} onMove={(offset) => moveQuestion(question.id, offset)} />)}
          </section>
        })}
        {kind === "quiz" && template.quizConfig && <section className="rounded-xl border bg-card p-4 sm:p-5">
          <button type="button" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} className="min-h-11 text-left text-sm font-semibold">人格维度、计分与类型描述 {advanced ? "−" : "+"}</button>
          {advanced && <div className="mt-4 space-y-8">
            <DimensionsTab dimensions={template.quizConfig.dimensions} scoring={template.quizConfig.scoring} onChange={(dimensions, scoring) => setTemplate({ ...template, quizConfig: { ...template.quizConfig!, dimensions, scoring } })} />
            <TypeLabelsTab typeLabels={template.quizConfig.typeLabels} onChange={(typeLabels) => setTemplate({ ...template, quizConfig: { ...template.quizConfig!, typeLabels } })} />
            <TypeDescriptionsTab typeDescriptions={template.quizConfig.typeDescriptions} onChange={(typeDescriptions) => setTemplate({ ...template, quizConfig: { ...template.quizConfig!, typeDescriptions } })} />
          </div>}
        </section>}
      </fieldset>}
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <h3 className="text-sm font-semibold">发布历史</h3><p className="mt-1 text-xs text-muted-foreground">版本只追加保存。已有答卷继续关联填写时的版本。</p>
      <ul className="mt-3 space-y-2 text-xs text-muted-foreground">{item.versions.map((version) => <li key={version.id} className="flex flex-wrap justify-between gap-2"><span>{version.version === 0 ? "原有问卷基线" : `版本 ${version.version}`}</span><time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Tokyo" })}（日本时间）</time></li>)}</ul>
    </section>
  </div>
}
