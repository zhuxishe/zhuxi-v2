"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { type FormEvent, useState, useTransition } from "react"
import {
  Activity,
  Award,
  History,
  Mail,
  RefreshCw,
  Save,
  Sparkles,
  UserRound,
} from "lucide-react"
import {
  recalculateMemberActivityStats,
  updateMemberProfileMetrics,
} from "@/app/admin/members/[id]/profile-metrics/actions"
import { Button } from "@/components/ui/button"
import type { AdminMemberProfileMetrics } from "@/lib/profile/queries"

interface MemberProfileMetricsCardProps {
  metrics: AdminMemberProfileMetrics
  member: {
    id: string
    email: string | null
    memberNumber: string | null
    fullName: string
    nickname: string | null
    schoolName: string | null
  }
}

const INPUT_CLASS = "min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
const LEVEL_LABELS: Record<1 | 2 | 3, string> = {
  1: "Lv.1 竹笋",
  2: "Lv.2 青竹",
  3: "Lv.3 熊猫竹王",
}
const AUDIT_FIELD_LABELS: Record<string, string> = {
  level: "会员等级",
  compatibility_score: "合拍分数",
  compatibilityScore: "合拍分数",
  compatibility_status: "发布状态",
  compatibilityStatus: "发布状态",
  internal_note: "内部备注",
  internalNote: "内部备注",
  score_source: "分数来源",
  scoreSource: "分数来源",
  activity_count: "活动次数",
  activityCount: "活动次数",
  late_count: "迟到次数",
  no_show_count: "缺席次数",
  last_activity_at: "最近活动时间",
}

function profileAvatarUrl(path: string | null) {
  if (!path) return null
  const params = new URLSearchParams({
    bucket: "community-avatars",
    path,
    audience: "admin",
  })
  return `/api/community/media?${params.toString()}`
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function formatAuditValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "未设置"
  if (field === "compatibility_status" || field === "compatibilityStatus") {
    return value === "published" ? "已发布" : "待发布"
  }
  if (field === "level") {
    const level = Number(value)
    return level === 1 || level === 2 || level === 3 ? LEVEL_LABELS[level] : String(value)
  }
  if (field === "compatibility_score" || field === "compatibilityScore") {
    const score = Number(value)
    return Number.isFinite(score) ? score.toFixed(1) : String(value)
  }
  if (field === "score_source" || field === "scoreSource") {
    return value === "manual" ? "人工设置" : "初始值"
  }
  if (field === "last_activity_at") return formatDate(String(value))
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function auditValue(values: Record<string, unknown>, field: string) {
  return values[field === "level" ? "member_level" : field]
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Award
  label: string
  value: string
  detail: React.ReactNode
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/80 bg-muted/25 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <div className="mt-1 min-h-5 text-xs leading-5 text-muted-foreground">{detail}</div>
    </div>
  )
}

export function MemberProfileMetricsCard({ metrics, member }: MemberProfileMetricsCardProps) {
  const router = useRouter()
  const [level, setLevel] = useState<1 | 2 | 3>(metrics.level)
  const [score, setScore] = useState(metrics.compatibilityScore.toFixed(1))
  const [status, setStatus] = useState<"pending" | "published">(metrics.compatibilityStatus)
  const [note, setNote] = useState(metrics.internalNote)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [savePending, startSaveTransition] = useTransition()
  const [recalculatePending, startRecalculateTransition] = useTransition()
  const avatarUrl = profileAvatarUrl(metrics.personalAvatarPath)
  const audit = metrics.latestAudit

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedScore = Number(score)
    setError(null)
    setMessage(null)
    startSaveTransition(async () => {
      const result = await updateMemberProfileMetrics({
        memberId: member.id,
        level,
        compatibilityScore: parsedScore,
        compatibilityStatus: status,
        internalNote: note,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setMessage("等级与合拍分设置已保存")
      router.refresh()
    })
  }

  function recalculate() {
    setError(null)
    setMessage(null)
    startRecalculateTransition(async () => {
      const result = await recalculateMemberActivityStats(member.id)
      if (!result.success) {
        setError(result.error)
        return
      }
      setMessage("活动次数已重新计算")
      router.refresh()
    })
  }

  return (
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10" aria-labelledby="member-profile-metrics-title">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-primary ring-1 ring-border">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={`${member.nickname || member.fullName}的个人头像`}
                  fill
                  unoptimized
                  priority
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <UserRound className="size-9" strokeWidth={1.6} aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="member-profile-metrics-title" className="truncate text-xl font-semibold tracking-tight">
                  {member.nickname || "未设置昵称"}
                </h2>
                <span className="rounded-full border border-primary/25 bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary">
                  {LEVEL_LABELS[metrics.level]}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{member.fullName}</p>
              {member.schoolName && <p className="mt-0.5 truncate text-sm text-muted-foreground">{member.schoolName}</p>}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Award className="size-3.5" aria-hidden="true" />会员编号：{member.memberNumber ?? "待分配"}</span>
                <span className="inline-flex min-w-0 items-center gap-1.5"><Mail className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{member.email ?? "未绑定邮箱"}</span></span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/80 bg-muted/25 px-3 py-2 text-xs leading-5 text-muted-foreground lg:max-w-xs">
            等级与合拍分为独立的后台运营字段，不使用面试评分或评价平均分。只有“已发布”的合拍分会展示给会员。
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric
            icon={Award}
            label="会员等级"
            value={LEVEL_LABELS[metrics.level]}
            detail={metrics.scoreSource === "manual" ? "人工设置" : "系统初始值"}
          />
          <Metric
            icon={Sparkles}
            label="合拍分数"
            value={metrics.compatibilityScore.toFixed(1)}
            detail={
              <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ${metrics.compatibilityStatus === "published" ? "bg-primary/10 text-primary" : "bg-amber-50 text-amber-700"}`}>
                {metrics.compatibilityStatus === "published" ? "已发布" : "待发布"}
              </span>
            }
          />
          <Metric
            icon={Activity}
            label="累计参加活动"
            value={`${metrics.activityCount} 次`}
            detail={metrics.lastActivityAt ? `最近参加：${formatDate(metrics.lastActivityAt)}` : "暂无活动记录"}
          />
        </div>
      </div>

      <div className="grid border-t border-border lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
        <form className="p-5 sm:p-6" onSubmit={save}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">运营设置</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">保存后会记录操作者、时间和字段变更。</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={recalculate} disabled={recalculatePending || savePending}>
              <RefreshCw className={`size-4 ${recalculatePending ? "animate-spin motion-reduce:animate-none" : ""}`} />
              {recalculatePending ? "计算中" : "重新计算活动次数"}
            </Button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">会员等级</span>
              <select value={level} onChange={(event) => setLevel(Number(event.target.value) as 1 | 2 | 3)} className={INPUT_CLASS} disabled={savePending}>
                <option value={1}>Lv.1 竹笋</option>
                <option value={2}>Lv.2 青竹</option>
                <option value={3}>Lv.3 熊猫竹王</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">合拍分数</span>
              <input
                type="number"
                min={1}
                max={5}
                step={0.1}
                inputMode="decimal"
                value={score}
                onChange={(event) => setScore(event.target.value)}
                className={INPUT_CLASS}
                disabled={savePending}
                aria-describedby="compatibility-score-help"
              />
              <span id="compatibility-score-help" className="mt-1 block text-xs text-muted-foreground">1.0–5.0，精确到一位小数</span>
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-2 text-xs font-medium text-muted-foreground">会员端发布状态</legend>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-1">
              {(["pending", "published"] as const).map((option) => (
                <label key={option} className={`flex min-h-10 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-medium transition ${status === option ? "border-primary/30 bg-card text-primary shadow-sm" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  <input type="radio" name="compatibility-status" value={option} checked={status === option} onChange={() => setStatus(option)} className="sr-only" disabled={savePending} />
                  {option === "pending" ? "待发布" : "已发布"}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">内部备注（必填）</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="仅后台可见，可记录等级或合拍分的判断依据。"
              className={`${INPUT_CLASS} resize-y py-2.5 leading-6`}
              disabled={savePending}
              aria-required="true"
            />
            <span className="mt-1 block text-right text-xs text-muted-foreground">{note.length}/2000</span>
          </label>

          {(error || message) && (
            <p role={error ? "alert" : "status"} className={`mt-4 rounded-lg px-3 py-2 text-sm ${error ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              {error ?? message}
            </p>
          )}

          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={savePending || recalculatePending}>
              <Save className="size-4" />
              {savePending ? "保存中" : "保存运营设置"}
            </Button>
          </div>
        </form>

        <aside className="border-t border-border bg-muted/20 p-5 sm:p-6 lg:border-l lg:border-t-0" aria-label="最近一次指标变更">
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">最近一次变更</h3>
          </div>
          {audit ? (
            <div className="mt-4">
              <p className="text-sm font-medium">{audit.actorName ?? "系统"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(audit.createdAt)}</p>
              <div className="mt-4 space-y-3">
                {audit.changedFields.length > 0 ? audit.changedFields.map((field: string) => (
                  <div key={field} className="rounded-lg border border-border/80 bg-card p-3">
                    <p className="text-xs font-medium text-muted-foreground">{AUDIT_FIELD_LABELS[field] ?? field}</p>
                    <p className="mt-1 break-words text-sm">
                      <span className="text-muted-foreground">{formatAuditValue(field, auditValue(audit.beforeValues, field))}</span>
                      <span className="mx-2 text-muted-foreground" aria-hidden="true">→</span>
                      <span className="font-medium">{formatAuditValue(field, auditValue(audit.afterValues, field))}</span>
                    </p>
                  </div>
                )) : (
                  <p className="rounded-lg border border-border/80 bg-card p-3 text-sm text-muted-foreground">
                    {audit.actionType === "activity_recalculate" ? "重新计算了活动统计" : "更新了会员运营指标"}
                  </p>
                )}
              </div>
              {audit.reason && <p className="mt-4 text-xs leading-5 text-muted-foreground">说明：{audit.reason}</p>}
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">尚无指标变更记录。首次保存后会在此显示审计信息。</p>
          )}
        </aside>
      </div>
    </section>
  )
}
