"use client"

import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import { EyeOff, RotateCcw, ShieldAlert, Trash2, X } from "lucide-react"
import { moderateCommunityContent } from "@/app/admin/community/content/actions"
import { Button } from "@/components/ui/button"
import { COMMUNITY_REMOVAL_REASONS, COMMUNITY_RESTORE_REASON } from "@/lib/community/moderation-reasons"
import { communityMediaUrl } from "@/lib/community/media"
import { CommunityStatusBadge } from "./CommunityStatusBadge"
import { COMMUNITY_ADMIN_INPUT_CLASS, COMMUNITY_ADMIN_LABEL_CLASS, formatAdminDate } from "./community-admin-ui"
import type {
  CommunityAdminContentRow,
  CommunityAdminReasonCode,
  CommunityUserContentStatus,
} from "./types"

const TYPE_LABELS = {
  treehole: "树洞",
  photo: "照片动态",
  comment: "评论",
  reply: "回复",
} as const

type ModerationAction = "hide" | "restore" | "delete"

function detailHref(row: CommunityAdminContentRow) {
  const base = row.parentPostType === "photo" ? "photos" : "treehole"
  const comment = row.targetType === "comment" ? `?comment=${row.id}#comment-${row.id}` : ""
  return `/app/community/${base}/${row.postId}${comment}`
}

function excerpt(row: CommunityAdminContentRow) {
  return row.title || row.body || (row.status === "deleted" ? "内容已删除" : "无文字内容")
}

function actionStatus(action: ModerationAction): CommunityUserContentStatus {
  if (action === "hide") return "hidden"
  if (action === "delete") return "deleted"
  return "published"
}

function actionLabel(action: ModerationAction) {
  if (action === "hide") return "隐藏"
  if (action === "delete") return "删除"
  return "恢复"
}

function ContentActions({ row }: { row: CommunityAdminContentRow }) {
  const router = useRouter()
  const panelId = useId()
  const [action, setAction] = useState<ModerationAction | null>(null)
  const [reason, setReason] = useState<CommunityAdminReasonCode>("privacy")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef<Partial<Record<ModerationAction, HTMLButtonElement | null>>>({})
  const lastActionRef = useRef<ModerationAction | null>(null)
  const restoreFocusRef = useRef(false)

  useEffect(() => {
    if (action) {
      lastActionRef.current = action
      panelRef.current?.focus()
      return
    }
    if (restoreFocusRef.current && lastActionRef.current) {
      triggerRefs.current[lastActionRef.current]?.focus()
      restoreFocusRef.current = false
    }
  }, [action])

  function close(options?: { force?: boolean }) {
    if (pending && !options?.force) return
    restoreFocusRef.current = true
    setAction(null)
    setError(null)
    setNote("")
  }

  function open(next: ModerationAction) {
    setAction(next)
    setReason(next === "restore" ? COMMUNITY_RESTORE_REASON.code : "privacy")
    setError(null)
    setMessage(null)
  }

  function submit() {
    if (!action) return
    setError(null)
    startTransition(async () => {
      const result = await moderateCommunityContent({
        targetType: row.targetType,
        targetId: row.id,
        postId: row.postId,
        status: actionStatus(action),
        reasonCode: action === "restore" ? COMMUNITY_RESTORE_REASON.code : reason,
        internalNote: note,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setMessage(`${actionLabel(action)}操作已完成`)
      close({ force: true })
      router.refresh()
    })
  }

  if (row.status === "deleted") return <p className="text-xs text-muted-foreground">删除为终态，不能恢复</p>

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {row.status === "published" ? (
          <Button
            ref={(node) => { triggerRefs.current.hide = node }}
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={action === "hide"}
            aria-controls={panelId}
            onClick={() => open("hide")}
          ><EyeOff className="size-4" />隐藏</Button>
        ) : (
          <Button
            ref={(node) => { triggerRefs.current.restore = node }}
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={action === "restore"}
            aria-controls={panelId}
            onClick={() => open("restore")}
          ><RotateCcw className="size-4" />恢复</Button>
        )}
        <Button
          ref={(node) => { triggerRefs.current.delete = node }}
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={action === "delete"}
          aria-controls={panelId}
          className="text-destructive hover:text-destructive"
          onClick={() => open("delete")}
        ><Trash2 className="size-4" />删除</Button>
      </div>
      {action ? <div
        ref={panelRef}
        id={panelId}
        role="region"
        aria-label={`${actionLabel(action)}这条${TYPE_LABELS[row.contentType]}`}
        tabIndex={-1}
        className="mt-4 rounded-lg border border-primary/25 bg-muted/30 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{actionLabel(action)}这条{TYPE_LABELS[row.contentType]}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {action === "delete" ? "删除后不可恢复。" : action === "hide" ? "内容会立即从会员端隐藏。" : "内容会重新对会员展示。"}
              所有操作都会记录管理员、原因和 30 天审计快照。
            </p>
          </div>
          <button type="button" onClick={() => close()} disabled={pending} aria-label="关闭处理面板" className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="size-4" /></button>
        </div>
        {action === "restore" ? (
          <p className="mt-3 rounded-lg bg-primary/8 px-3 py-2 text-sm">原因：{COMMUNITY_RESTORE_REASON.label}</p>
        ) : (
          <label className="mt-3 block">
            <span className={COMMUNITY_ADMIN_LABEL_CLASS}>标准处理原因</span>
            <select value={reason} onChange={(event) => setReason(event.target.value as CommunityAdminReasonCode)} className={COMMUNITY_ADMIN_INPUT_CLASS}>
              {COMMUNITY_REMOVAL_REASONS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select>
          </label>
        )}
        <label className="mt-3 block">
          <span className={COMMUNITY_ADMIN_LABEL_CLASS}>内部备注（可选，不会发送给会员）</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} className={COMMUNITY_ADMIN_INPUT_CLASS} />
        </label>
        {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant={action === "delete" ? "destructive" : "default"} onClick={submit} disabled={pending}>
            {pending ? "处理中…" : `确认${actionLabel(action)}`}
          </Button>
          <Button type="button" variant="outline" onClick={() => close()} disabled={pending}>取消</Button>
        </div>
      </div> : null}
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs font-medium text-primary">{message}</p>
    </div>
  )
}

export function CommunityContentList({ rows }: { rows: CommunityAdminContentRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-14 text-center">
        <ShieldAlert className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 font-medium">没有符合条件的内容</p>
        <p className="mt-1 text-sm text-muted-foreground">调整筛选条件后再试。</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <article key={`${row.targetType}-${row.id}`} className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{TYPE_LABELS[row.contentType]}</span>
                <CommunityStatusBadge status={row.status} />
                {row.isAnonymous ? <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">匿名</span> : null}
                {row.pendingReportCount > 0 ? <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">待处理举报 {row.pendingReportCount}</span> : row.totalReportCount > 0 ? <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">历史举报 {row.totalReportCount}</span> : null}
              </div>
              <h3 className="mt-3 whitespace-pre-wrap text-sm font-medium leading-6 text-foreground">{excerpt(row)}</h3>
              {row.title && row.body ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{row.body}</p> : null}
              {row.targetType === "comment" && row.parentPostTitle ? <p className="mt-2 text-xs text-muted-foreground">所属树洞：{row.parentPostTitle}</p> : null}
              {row.images.length > 0 ? (
                <div className={`mt-3 grid max-w-xl gap-2 ${row.images.length === 1 ? "grid-cols-1" : row.images.length === 2 || row.images.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {row.images.map((image, index) => (
                    <a
                      key={image.id}
                      href={communityMediaUrl(image.storagePath, false, "admin")}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`查看第 ${index + 1} 张照片原图`}
                      className={`relative overflow-hidden rounded-lg bg-muted ${row.images.length === 1 ? "aspect-[4/3]" : "aspect-square"}`}
                    >
                      <Image
                        src={communityMediaUrl(image.thumbnailPath, true, "admin")}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover"
                        sizes={row.images.length === 1 ? "576px" : "192px"}
                      />
                    </a>
                  ))}
                </div>
              ) : null}
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <div><dt className="inline">作者：</dt><dd className="inline">{row.isAnonymous ? "匿名会员（身份受保护）" : row.authorNickname ?? "社区会员"}</dd></div>
                <div><dt className="inline">发布时间：</dt><dd className="inline">{formatAdminDate(row.occurredAt)}</dd></div>
                {row.imageCount > 0 ? <div><dt className="inline">照片：</dt><dd className="inline">{row.imageCount} 张</dd></div> : null}
                {row.likeCount !== null ? <div><dt className="inline">点赞：</dt><dd className="inline">{row.likeCount}</dd></div> : null}
                {row.commentCount !== null ? <div><dt className="inline">评论：</dt><dd className="inline">{row.commentCount}</dd></div> : null}
              </dl>
              {row.status === "published" ? (
                <Link href={detailHref(row)} target="_blank" className="mt-3 inline-flex min-h-9 items-center text-sm font-medium text-primary hover:underline">在会员端查看</Link>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">该内容当前不在会员端展示</p>
              )}
            </div>
            <div className="shrink-0 lg:w-72"><ContentActions row={row} /></div>
          </div>
        </article>
      ))}
    </div>
  )
}
