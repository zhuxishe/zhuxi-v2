"use client"

import { useState, useTransition } from "react"
import { CircleHelp, Eye, EyeOff, Pencil, Plus, Sparkles, StarOff, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CommunityStatusBadge } from "./CommunityStatusBadge"
import { COMMUNITY_ADMIN_INPUT_CLASS, COMMUNITY_ADMIN_LABEL_CLASS, formatAdminDate } from "./community-admin-ui"
import type { CommunityFaq, CommunityFaqInput } from "./types"
import {
  createCommunityFaq,
  deleteCommunityFaq,
  setCommunityFaqFeatured,
  setCommunityFaqStatus,
  updateCommunityFaq,
} from "@/app/admin/community/qa/actions"

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "")
}

function faqInput(formData: FormData): CommunityFaqInput {
  return {
    question_zh: value(formData, "question_zh"),
    answer_zh: value(formData, "answer_zh"),
    question_ja: value(formData, "question_ja"),
    answer_ja: value(formData, "answer_ja"),
    status: value(formData, "status") as CommunityFaqInput["status"],
    is_featured: formData.get("is_featured") === "on",
    sort_order: Number(formData.get("sort_order") ?? 0),
  }
}

function FaqEditor({ item, onDone }: { item?: CommunityFaq; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input = faqInput(new FormData(form))
    setError(null)
    startTransition(async () => {
      const result = item ? await updateCommunityFaq(item.id, input) : await createCommunityFaq(input)
      if ("error" in result && result.error) {
        setError(result.error)
        return
      }
      if (!item) form.reset()
      onDone()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-primary/25 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">{item ? "编辑问答" : "创建问答"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">至少完整填写一种语言；会员端会整条回退，不会混合语言。</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onDone} aria-label="关闭编辑器"><X className="size-4" /></Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <FaqLanguageFields language="中文" suffix="zh" question={item?.question_zh ?? ""} answer={item?.answer_zh ?? ""} />
        <FaqLanguageFields language="日文" suffix="ja" question={item?.question_ja ?? ""} answer={item?.answer_ja ?? ""} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label>
          <span className={COMMUNITY_ADMIN_LABEL_CLASS}>状态</span>
          <select name="status" defaultValue={item?.status ?? "draft"} className={COMMUNITY_ADMIN_INPUT_CLASS}>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="offline">已下线</option>
          </select>
        </label>
        <label>
          <span className={COMMUNITY_ADMIN_LABEL_CLASS}>排序值</span>
          <input name="sort_order" type="number" defaultValue={item?.sort_order ?? 0} className={COMMUNITY_ADMIN_INPUT_CLASS} />
        </label>
        <label className="flex min-h-10 items-center gap-2 pt-1 text-sm sm:pt-7">
          <input name="is_featured" type="checkbox" defaultChecked={item?.is_featured ?? false} className="size-4 accent-primary" />
          设为精选（已发布最多 2 条）
        </label>
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "保存中…" : item ? "保存修改" : "创建问答"}</Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>取消</Button>
      </div>
    </form>
  )
}

function FaqLanguageFields({ language, suffix, question, answer }: { language: string; suffix: "zh" | "ja"; question: string; answer: string }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{language}</legend>
      <label>
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>问题</span>
        <textarea name={`question_${suffix}`} maxLength={500} rows={2} defaultValue={question} className={COMMUNITY_ADMIN_INPUT_CLASS} />
      </label>
      <label>
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>答案</span>
        <textarea name={`answer_${suffix}`} rows={7} defaultValue={answer} className={COMMUNITY_ADMIN_INPUT_CLASS} />
      </label>
    </fieldset>
  )
}

export function FaqManager({ faqs }: { faqs: CommunityFaq[] }) {
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function runAction(action: () => Promise<{ error?: string; success?: true }>, successMessage: string) {
    setMessage(null)
    startTransition(async () => {
      const result = await action()
      setMessage(result.error ?? successMessage)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">共 {faqs.length} 条问答 · 已发布精选 {faqs.filter((faq) => faq.status === "published" && faq.is_featured).length}/2</p>
        {!creating ? <Button onClick={() => { setCreating(true); setEditingId(null) }}><Plus className="size-4" /> 创建问答</Button> : null}
      </div>
      {creating ? <FaqEditor onDone={() => setCreating(false)} /> : null}
      {message ? <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">{message}</p> : null}

      {faqs.length === 0 && !creating ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-14 text-center">
          <CircleHelp className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">暂无官方问答</p>
          <p className="mt-1 text-sm text-muted-foreground">创建后可在会员端以折叠列表展示。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {faqs.map((item) => editingId === item.id ? (
            <FaqEditor key={item.id} item={item} onDone={() => setEditingId(null)} />
          ) : (
            <article key={item.id} className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CommunityStatusBadge status={item.status} />
                    {item.is_featured ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary"><Sparkles className="size-3" /> 精选</span> : null}
                    <span className="text-xs text-muted-foreground">排序 {item.sort_order}</span>
                  </div>
                  <h3 className="mt-3 font-semibold text-foreground">{item.question_zh ?? item.question_ja}</h3>
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.answer_zh ?? item.answer_ja}</p>
                  <p className="mt-3 text-xs text-muted-foreground">发布于 {formatAdminDate(item.published_at)}</p>
                  <details className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-primary">预览中日文内容</summary>
                    <div className="mt-3 grid gap-4 xl:grid-cols-2">
                      <FaqLanguagePreview language="中文" question={item.question_zh} answer={item.answer_zh} />
                      <FaqLanguagePreview language="日文" question={item.question_ja} answer={item.answer_ja} />
                    </div>
                  </details>
                </div>
                <div className="flex flex-wrap gap-1 border-t border-border pt-3 lg:max-w-64 lg:justify-end lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                  <Button variant="ghost" size="sm" onClick={() => { setEditingId(item.id); setCreating(false) }} disabled={pending}><Pencil className="size-4" /> 编辑</Button>
                  <Button variant="ghost" size="sm" onClick={() => runAction(() => setCommunityFaqFeatured(item.id, !item.is_featured), item.is_featured ? "已取消精选" : "已设为精选")} disabled={pending}>
                    {item.is_featured ? <StarOff className="size-4" /> : <Sparkles className="size-4" />}{item.is_featured ? "取消精选" : "精选"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => runAction(() => setCommunityFaqStatus(item.id, item.status === "published" ? "offline" : "published"), item.status === "published" ? "问答已下线" : "问答已发布")} disabled={pending}>
                    {item.status === "published" ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{item.status === "published" ? "下线" : "发布"}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => {
                    if (window.confirm(`确定永久删除「${item.question_zh ?? item.question_ja}」？`)) runAction(() => deleteCommunityFaq(item.id), "问答已删除")
                  }} disabled={pending}><Trash2 className="size-4" /> 删除</Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function FaqLanguagePreview({ language, question, answer }: { language: string; question: string | null; answer: string | null }) {
  return (
    <div className="rounded-lg bg-card p-3 text-sm">
      <p className="text-xs font-semibold text-muted-foreground">{language}</p>
      {question ? (
        <>
          <p className="mt-2 font-semibold">{question}</p>
          <p className="mt-2 whitespace-pre-wrap leading-6 text-muted-foreground">{answer}</p>
        </>
      ) : <p className="mt-2 text-muted-foreground">未填写，将回退到另一语言</p>}
    </div>
  )
}
