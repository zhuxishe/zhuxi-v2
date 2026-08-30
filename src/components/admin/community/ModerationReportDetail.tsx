"use client"

import Image from "next/image"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Gavel, ShieldAlert, Trash2, UserSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CommunityStatusBadge } from "./CommunityStatusBadge"
import { CommunityAvatar } from "@/components/community/CommunityAvatar"
import { COMMUNITY_ADMIN_INPUT_CLASS, COMMUNITY_ADMIN_LABEL_CLASS, formatAdminDate, formatProtectedMemberNumber } from "./community-admin-ui"
import { REPORT_REASON_LABELS } from "./ModerationQueue"
import type { CommunityReportDetail, CommunityRevealedAuthor } from "./types"
import { communityMediaUrl } from "@/lib/community/media"
import {
  applyCommunitySanction,
  resetReportedCommunityProfileAvatar,
  resolveCommunityReport,
  revealCommunityReportAuthor,
} from "@/app/admin/community/moderation/actions"

const ACTION_LABELS: Record<string, string> = {
  dismiss_report: "驳回举报",
  resolve_report: "完成举报处理",
  hide_content: "隐藏内容",
  delete_content: "删除内容",
  restore_content: "恢复内容",
  warn_member: "警告会员",
  mute_member: "临时限制会员",
  permanent_ban: "永久封禁会员",
  revoke_sanction: "解除限制",
  reveal_anonymous_author: "查看作者身份",
  reset_profile: "重置社区身份",
}

export function ModerationReportDetail({
  report,
  adminRole,
}: {
  report: CommunityReportDetail
  adminRole: "admin" | "super_admin"
}) {
  const router = useRouter()
  const [internalNote, setInternalNote] = useState("")
  const [auditReason, setAuditReason] = useState("")
  const [sanctionReason, setSanctionReason] = useState("")
  const [muteDays, setMuteDays] = useState<1 | 7 | 30>(7)
  const [author, setAuthor] = useState<CommunityRevealedAuthor | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function runDecision(decision: "dismissed" | "resolved" | "hidden" | "deleted") {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await resolveCommunityReport(report.id, decision, internalNote)
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage(
        decision === "dismissed"
          ? "举报已驳回"
          : decision === "hidden"
            ? "内容已隐藏，举报已处理"
            : decision === "deleted"
              ? "内容已删除，举报已处理"
              : "举报已处理"
      )
      router.refresh()
    })
  }

  function resetReportedAvatar() {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await resetReportedCommunityProfileAvatar(report.id, internalNote)
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage("违规头像已重置，举报已处理")
      router.refresh()
    })
  }

  function revealAuthor() {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await revealCommunityReportAuthor(report.id, auditReason)
      if (result.error || !result.author) {
        setError(result.error ?? "无法读取作者身份")
        return
      }
      setAuthor(result.author)
      setMessage(
        report.target_type === "profile"
          ? "关联会员已读取"
          : "作者身份已读取；匿名作者查看行为已写入审计记录"
      )
      router.refresh()
    })
  }

  function sanction(type: "warning" | "mute" | "permanent_ban") {
    if (!author) return
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await applyCommunitySanction(
        author.member_id,
        type,
        sanctionReason,
        type === "mute" ? muteDays : undefined
      )
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage(type === "warning" ? "警告已发送" : type === "mute" ? `已限制 ${muteDays} 天` : "已永久封禁社区访问")
      setSanctionReason("")
      router.refresh()
    })
  }

  const contentActionAvailable = report.target_type === "post" || report.target_type === "comment"

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
      <div className="space-y-5">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <CommunityStatusBadge status={report.status} />
            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{report.target_type}</span>
            {report.target_uses_snapshot ? (
              <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">举报时快照</span>
            ) : (
              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">当前内容 · 无可用快照</span>
            )}
            {report.target_is_anonymous ? <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">匿名内容</span> : null}
          </div>
          <p className="mt-4 text-xs font-medium text-muted-foreground">
            {report.target_uses_snapshot ? "举报提交时的内容" : "当前内容（举报快照已过期或不可用）"}
          </p>
          <h3 className="mt-1 text-lg font-semibold">{report.target_title}</h3>
          {report.target_excerpt ? (
            <div className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/60 p-4 text-sm leading-7 text-foreground">{report.target_excerpt}</div>
          ) : (
            <p className="mt-3 rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">目标内容已不可用或没有正文。</p>
          )}
          {report.target_images.length > 0 ? (
            <div className={`mt-3 grid gap-2 ${report.target_images.length === 1 ? "grid-cols-1" : report.target_images.length === 2 || report.target_images.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
              {report.target_images.map((image, index) => (
                <a key={image.id} href={communityMediaUrl(image.storage_path, false, "admin")} target="_blank" rel="noreferrer" className={`relative overflow-hidden rounded-lg bg-muted ${report.target_images.length === 1 ? "aspect-[4/3] max-w-xl" : "aspect-square"}`} aria-label={`查看第 ${index + 1} 张被举报照片`}>
                  <Image src={communityMediaUrl(image.thumbnail_path, true, "admin")} alt={`被举报照片 ${index + 1}`} fill unoptimized className="object-cover" sizes={report.target_images.length === 1 ? "640px" : "240px"} />
                </a>
              ))}
            </div>
          ) : null}
          {report.target_profile ? (
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/60 p-4">
              <CommunityAvatar profile={report.target_profile} audience="admin" size="lg" alt={`${report.target_profile.nickname} 的社区头像`} />
              <div>
                <p className="font-medium">{report.target_profile.nickname}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {report.target_uses_snapshot ? "举报时的社区头像与昵称" : "当前社区头像与昵称"}
                </p>
              </div>
            </div>
          ) : null}
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">内容当前状态</dt><dd className="mt-1 font-medium">{report.target_status ?? "—"}</dd></div>
            {report.target_uses_snapshot ? <div><dt className="text-xs text-muted-foreground">举报时状态</dt><dd className="mt-1 font-medium">{report.target_snapshot_status ?? "—"}</dd></div> : null}
            <div><dt className="text-xs text-muted-foreground">举报提交时间</dt><dd className="mt-1 font-medium">{formatAdminDate(report.created_at)}</dd></div>
            {report.target_snapshot_captured_at ? <div><dt className="text-xs text-muted-foreground">快照记录时间</dt><dd className="mt-1 font-medium">{formatAdminDate(report.target_snapshot_captured_at)}</dd></div> : null}
            <div><dt className="text-xs text-muted-foreground">举报人会员编号</dt><dd className="mt-1 font-medium">{formatProtectedMemberNumber(report.reporter_number, adminRole === "super_admin")}</dd></div>
            <div><dt className="text-xs text-muted-foreground">举报原因</dt><dd className="mt-1 font-medium">{REPORT_REASON_LABELS[report.reason]}</dd></div>
            <div><dt className="text-xs text-muted-foreground">该目标累计举报</dt><dd className="mt-1 font-medium">{report.target_report_count} 次</dd></div>
          </dl>
          {report.details ? (
            <div className="mt-4 rounded-lg border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground">举报补充说明</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{report.details}</p>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2">
            <UserSearch className="size-5 text-primary" />
            <h3 className="font-semibold">作者与处罚</h3>
          </div>
          {author ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-muted/60 p-4 text-sm">
                <p className="font-medium">{author.nickname ?? "未设置社区昵称"}</p>
                <p className="mt-1 text-muted-foreground">会员编号：{formatProtectedMemberNumber(author.member_number, adminRole === "super_admin")}</p>
                <p className="mt-1 text-muted-foreground">历史处罚：{author.sanctions.length} 条</p>
                {author.sanctions.length > 0 ? (
                  <ul className="mt-3 space-y-2 border-t border-border pt-3">
                    {author.sanctions.slice(0, 5).map((sanction) => (
                      <li key={sanction.id} className="text-xs leading-5">
                        <span className="font-medium">{sanction.sanction_type === "warning" ? "警告" : sanction.sanction_type === "mute" ? "临时限制" : "永久封禁"}</span>
                        <span className="ml-2 text-muted-foreground">{sanction.reason} · {formatAdminDate(sanction.starts_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <label>
                <span className={COMMUNITY_ADMIN_LABEL_CLASS}>处罚原因（会员将收到该原因）</span>
                <textarea value={sanctionReason} onChange={(event) => setSanctionReason(event.target.value)} rows={3} className={COMMUNITY_ADMIN_INPUT_CLASS} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => sanction("warning")} disabled={pending}><ShieldAlert className="size-4" /> 警告</Button>
                <select value={muteDays} onChange={(event) => setMuteDays(Number(event.target.value) as 1 | 7 | 30)} aria-label="临时限制天数" className="min-h-9 rounded-lg border border-border bg-background px-2 text-sm">
                  <option value={1}>1 天</option>
                  <option value={7}>7 天</option>
                  <option value={30}>30 天</option>
                </select>
                <Button variant="outline" onClick={() => sanction("mute")} disabled={pending}><Gavel className="size-4" /> 临时限制</Button>
                {adminRole === "super_admin" ? (
                  <Button variant="destructive" onClick={() => {
                    if (window.confirm("永久封禁后，该会员将无法再次进入社区。确定继续？")) sanction("permanent_ban")
                  }} disabled={pending}><Gavel className="size-4" /> 永久封禁</Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">处罚前先读取被举报内容的关联会员。匿名内容的读取理由会永久写入审核日志。</p>
              <label>
                <span className={COMMUNITY_ADMIN_LABEL_CLASS}>查看理由</span>
                <input value={auditReason} onChange={(event) => setAuditReason(event.target.value)} placeholder="例如：处理举报并确认历史违规" className={COMMUNITY_ADMIN_INPUT_CLASS} />
              </label>
              <Button variant="outline" onClick={revealAuthor} disabled={pending}><Eye className="size-4" /> 读取关联会员</Button>
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <h3 className="font-semibold">处理举报</h3>
          {report.status === "pending" ? (
            <div className="mt-4 space-y-4">
              <label>
                <span className={COMMUNITY_ADMIN_LABEL_CLASS}>内部处理说明</span>
                <textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} rows={5} placeholder="必填。记录判断依据和处理理由。" className={COMMUNITY_ADMIN_INPUT_CLASS} />
              </label>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Button variant="outline" onClick={() => runDecision("dismissed")} disabled={pending}>驳回举报</Button>
                <Button variant="outline" onClick={() => runDecision("resolved")} disabled={pending}>仅标记已处理</Button>
                {contentActionAvailable ? (
                  <>
                    <Button variant="outline" onClick={() => runDecision("hidden")} disabled={pending}><EyeOff className="size-4" /> 隐藏并处理</Button>
                    <Button variant="destructive" onClick={() => {
                      if (window.confirm("删除后内容将立即从会员端消失。确定继续？")) runDecision("deleted")
                    }} disabled={pending}><Trash2 className="size-4" /> 删除并处理</Button>
                  </>
                ) : report.target_type === "profile" ? (
                  <Button variant="destructive" onClick={resetReportedAvatar} disabled={pending}><Trash2 className="size-4" />重置头像并处理</Button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">该举报已于 {formatAdminDate(report.resolved_at)} 完成处理。</p>
          )}
          {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
          {message ? <p role="status" className="mt-4 text-sm text-primary">{message}</p> : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <h3 className="font-semibold">处理历史</h3>
          {report.actions.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">尚无处理记录</p>
          ) : (
            <ol className="mt-4 space-y-4 border-l border-border pl-4">
              {report.actions.map((action) => (
                <li key={action.id}>
                  <p className="text-sm font-medium">{ACTION_LABELS[action.action_type] ?? action.action_type}</p>
                  {action.internal_note ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{action.internal_note}</p> : null}
                  <time className="mt-1 block text-xs text-muted-foreground">{formatAdminDate(action.created_at)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  )
}
