"use client"

import { useState, useTransition } from "react"
import { BellRing, Eye, EyeOff, Pencil, Pin, PinOff, Plus, Send, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CommunityStatusBadge } from "./CommunityStatusBadge"
import {
  COMMUNITY_ADMIN_INPUT_CLASS,
  COMMUNITY_ADMIN_LABEL_CLASS,
  formatAdminDate,
  toDateTimeLocalValue,
} from "./community-admin-ui"
import type { CommunityAnnouncement, CommunityAnnouncementInput } from "./types"
import {
  createCommunityAnnouncement,
  deleteCommunityAnnouncement,
  resendCommunityAnnouncementNotification,
  setCommunityAnnouncementPinned,
  setCommunityAnnouncementStatus,
  updateCommunityAnnouncement,
} from "@/app/admin/community/announcements/actions"

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "")
}

function announcementInput(formData: FormData): CommunityAnnouncementInput {
  return {
    title_zh: getString(formData, "title_zh"),
    summary_zh: getString(formData, "summary_zh"),
    body_zh: getString(formData, "body_zh"),
    title_ja: getString(formData, "title_ja"),
    summary_ja: getString(formData, "summary_ja"),
    body_ja: getString(formData, "body_ja"),
    publisher_name: getString(formData, "publisher_name"),
    status: getString(formData, "status") as CommunityAnnouncementInput["status"],
    is_pinned: formData.get("is_pinned") === "on",
    display_start_at: getString(formData, "display_start_at"),
    display_end_at: getString(formData, "display_end_at"),
    link_url: getString(formData, "link_url"),
    link_text_zh: getString(formData, "link_text_zh"),
    link_text_ja: getString(formData, "link_text_ja"),
    notify_on_publish: formData.get("notify_on_publish") === "on",
    sort_order: Number(formData.get("sort_order") ?? 0),
  }
}

interface EditorProps {
  item?: CommunityAnnouncement
  onDone: () => void
}

function AnnouncementEditor({ item, onDone }: EditorProps) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const input = announcementInput(new FormData(form))
    setError(null)
    startTransition(async () => {
      const result = item
        ? await updateCommunityAnnouncement(item.id, input)
        : await createCommunityAnnouncement(input)
      if (result.error) {
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
          <h3 className="font-semibold text-foreground">{item ? "编辑公告" : "创建公告"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">每种语言需要完整填写标题、摘要和正文；至少完成一种语言。</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onDone} aria-label="关闭编辑器">
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <LanguageFields
          language="中文"
          suffix="zh"
          title={item?.title_zh ?? ""}
          summary={item?.summary_zh ?? ""}
          body={item?.body_zh ?? ""}
        />
        <LanguageFields
          language="日文"
          suffix="ja"
          title={item?.title_ja ?? ""}
          summary={item?.summary_ja ?? ""}
          body={item?.body_ja ?? ""}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label>
          <span className={COMMUNITY_ADMIN_LABEL_CLASS}>发布者</span>
          <input name="publisher_name" required maxLength={100} defaultValue={item?.publisher_name ?? "竹溪社运营"} className={COMMUNITY_ADMIN_INPUT_CLASS} />
        </label>
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
        <div className="space-y-2 pt-1 sm:pt-7">
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input name="is_pinned" type="checkbox" defaultChecked={item?.is_pinned ?? false} className="size-4 accent-primary" />
            置顶公告
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input name="notify_on_publish" type="checkbox" defaultChecked={item?.notify_on_publish ?? true} className="size-4 accent-primary" />
            首次发布时通知会员
          </label>
        </div>
      </div>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium">展示时间（日本时间，可选）</legend>
        <label>
          <span className={COMMUNITY_ADMIN_LABEL_CLASS}>开始</span>
          <input name="display_start_at" type="datetime-local" defaultValue={toDateTimeLocalValue(item?.display_start_at)} className={COMMUNITY_ADMIN_INPUT_CLASS} />
        </label>
        <label>
          <span className={COMMUNITY_ADMIN_LABEL_CLASS}>结束</span>
          <input name="display_end_at" type="datetime-local" defaultValue={toDateTimeLocalValue(item?.display_end_at)} className={COMMUNITY_ADMIN_INPUT_CLASS} />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium">单一跳转链接（可选）</legend>
        <label className="sm:col-span-2">
          <span className={COMMUNITY_ADMIN_LABEL_CLASS}>URL</span>
          <input name="link_url" type="url" defaultValue={item?.link_url ?? ""} placeholder="https://" className={COMMUNITY_ADMIN_INPUT_CLASS} />
        </label>
        <label>
          <span className={COMMUNITY_ADMIN_LABEL_CLASS}>中文链接文字</span>
          <input name="link_text_zh" defaultValue={item?.link_text_zh ?? ""} className={COMMUNITY_ADMIN_INPUT_CLASS} />
        </label>
        <label>
          <span className={COMMUNITY_ADMIN_LABEL_CLASS}>日文链接文字</span>
          <input name="link_text_ja" defaultValue={item?.link_text_ja ?? ""} className={COMMUNITY_ADMIN_INPUT_CLASS} />
        </label>
      </fieldset>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "保存中…" : item ? "保存修改" : "创建公告"}</Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>取消</Button>
      </div>
    </form>
  )
}

function LanguageFields({
  language,
  suffix,
  title,
  summary,
  body,
}: {
  language: string
  suffix: "zh" | "ja"
  title: string
  summary: string
  body: string
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{language}</legend>
      <label>
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>标题</span>
        <input name={`title_${suffix}`} maxLength={200} defaultValue={title} className={COMMUNITY_ADMIN_INPUT_CLASS} />
      </label>
      <label>
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>摘要</span>
        <textarea name={`summary_${suffix}`} maxLength={500} rows={3} defaultValue={summary} className={COMMUNITY_ADMIN_INPUT_CLASS} />
      </label>
      <label>
        <span className={COMMUNITY_ADMIN_LABEL_CLASS}>正文</span>
        <textarea name={`body_${suffix}`} rows={8} defaultValue={body} className={COMMUNITY_ADMIN_INPUT_CLASS} />
      </label>
    </fieldset>
  )
}

export function AnnouncementManager({ announcements }: { announcements: CommunityAnnouncement[] }) {
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
        <p className="text-sm text-muted-foreground">共 {announcements.length} 条公告</p>
        {!creating ? (
          <Button onClick={() => { setCreating(true); setEditingId(null) }}>
            <Plus className="size-4" /> 创建公告
          </Button>
        ) : null}
      </div>

      {creating ? <AnnouncementEditor onDone={() => setCreating(false)} /> : null}
      {message ? <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{message}</p> : null}

      {announcements.length === 0 && !creating ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-4 py-14 text-center">
          <BellRing className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">暂无公告</p>
          <p className="mt-1 text-sm text-muted-foreground">创建第一条中文或日文公告。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((item) =>
            editingId === item.id ? (
              <AnnouncementEditor key={item.id} item={item} onDone={() => setEditingId(null)} />
            ) : (
              <article key={item.id} className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CommunityStatusBadge status={item.status} />
                      {item.is_pinned ? <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">置顶</span> : null}
                      <span className="text-xs text-muted-foreground">排序 {item.sort_order}</span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-foreground">{item.title_zh ?? item.title_ja}</h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.summary_zh ?? item.summary_ja}</p>
                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                      <div><dt className="inline font-medium text-foreground">发布者：</dt><dd className="inline">{item.publisher_name}</dd></div>
                      <div><dt className="inline font-medium text-foreground">发布时间：</dt><dd className="inline">{formatAdminDate(item.published_at)}</dd></div>
                      <div><dt className="inline font-medium text-foreground">展示开始：</dt><dd className="inline">{formatAdminDate(item.display_start_at)}</dd></div>
                      <div><dt className="inline font-medium text-foreground">通知：</dt><dd className="inline">{item.notified_at ? formatAdminDate(item.notified_at) : item.notify_on_publish ? "等待发送" : "不发送"}</dd></div>
                    </dl>
                    <details className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                      <summary className="cursor-pointer text-sm font-medium text-primary">预览中日文内容</summary>
                      <div className="mt-3 grid gap-4 xl:grid-cols-2">
                        <AnnouncementLanguagePreview language="中文" title={item.title_zh} summary={item.summary_zh} body={item.body_zh} />
                        <AnnouncementLanguagePreview language="日文" title={item.title_ja} summary={item.summary_ja} body={item.body_ja} />
                      </div>
                    </details>
                  </div>

                  <div className="flex flex-wrap gap-1 border-t border-border pt-3 lg:max-w-64 lg:justify-end lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingId(item.id); setCreating(false) }} disabled={pending}>
                      <Pencil className="size-4" /> 编辑
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => runAction(() => setCommunityAnnouncementPinned(item.id, !item.is_pinned), item.is_pinned ? "已取消置顶" : "已置顶")} disabled={pending}>
                      {item.is_pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                      {item.is_pinned ? "取消置顶" : "置顶"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => runAction(
                        () => setCommunityAnnouncementStatus(item.id, item.status === "published" ? "offline" : "published"),
                        item.status === "published" ? "公告已下线" : "公告已发布"
                      )}
                      disabled={pending}
                    >
                      {item.status === "published" ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      {item.status === "published" ? "下线" : "发布"}
                    </Button>
                    {item.status === "published" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (window.confirm("确定再次向开启公告通知的会员发送这条公告？")) {
                            runAction(() => resendCommunityAnnouncementNotification(item.id), "已提交再次通知")
                          }
                        }}
                        disabled={pending}
                      >
                        <Send className="size-4" /> 再次通知
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm(`确定永久删除「${item.title_zh ?? item.title_ja}」？`)) {
                          runAction(() => deleteCommunityAnnouncement(item.id), "公告已删除")
                        }
                      }}
                      disabled={pending}
                    >
                      <Trash2 className="size-4" /> 删除
                    </Button>
                  </div>
                </div>
              </article>
            )
          )}
        </div>
      )}
    </div>
  )
}

function AnnouncementLanguagePreview({ language, title, summary, body }: { language: string; title: string | null; summary: string | null; body: string | null }) {
  return (
    <div className="rounded-lg bg-card p-3 text-sm">
      <p className="text-xs font-semibold text-muted-foreground">{language}</p>
      {title ? (
        <>
          <p className="mt-2 font-semibold">{title}</p>
          <p className="mt-1 text-muted-foreground">{summary}</p>
          <p className="mt-3 whitespace-pre-wrap leading-6">{body}</p>
        </>
      ) : <p className="mt-2 text-muted-foreground">未填写，将回退到另一语言</p>}
    </div>
  )
}
