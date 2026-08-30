"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, Gavel, MessageCircle, MessageSquareText, RotateCcw, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CommunityAvatar } from "@/components/community/CommunityAvatar"
import { CommunityMetricCard } from "./CommunityMetricCard"
import { COMMUNITY_ADMIN_INPUT_CLASS, COMMUNITY_ADMIN_LABEL_CLASS, formatAdminDate, formatProtectedMemberNumber } from "./community-admin-ui"
import type { CommunityMemberDetail as MemberDetail } from "./types"
import {
  applyCommunitySanction,
  resetCommunityProfileAvatar,
  revokeCommunitySanction,
} from "@/app/admin/community/moderation/actions"

const SANCTION_LABELS = {
  warning: "警告",
  mute: "临时限制",
  permanent_ban: "永久封禁",
} as const

export function CommunityMemberDetail({ member, adminRole }: { member: MemberDetail; adminRole: "admin" | "super_admin" }) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [avatarResetReason, setAvatarResetReason] = useState("")
  const [muteDays, setMuteDays] = useState<1 | 7 | 30>(7)
  const [revokeReasons, setRevokeReasons] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function sanction(type: "warning" | "mute" | "permanent_ban") {
    if (!member.member_id) return
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await applyCommunitySanction(member.member_id as string, type, reason, type === "mute" ? muteDays : undefined)
      if (result.error) {
        setError(result.error)
        return
      }
      setReason("")
      setMessage(type === "warning" ? "警告已发送" : type === "mute" ? `已限制 ${muteDays} 天` : "已永久封禁社区访问")
      router.refresh()
    })
  }

  function revoke(sanctionId: string) {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await revokeCommunitySanction(sanctionId, revokeReasons[sanctionId] ?? "")
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage("限制已解除")
      router.refresh()
    })
  }

  function resetAvatar() {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await resetCommunityProfileAvatar(member.profile_id, avatarResetReason)
      if (result.error) {
        setError(result.error)
        return
      }
      setAvatarResetReason("")
      setMessage("社区头像已重置为默认头像")
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <CommunityAvatar profile={{
              id: member.profile_id,
              nickname: member.nickname,
              avatarKind: member.avatar_kind,
              avatarPath: member.avatar_path,
              presetAvatar: member.preset_avatar,
              joinedAt: member.joined_at,
            }} size="lg" audience="admin" alt={`${member.nickname} 的社区头像`} />
            <div>
            <p className="text-xs font-medium text-primary">社区身份</p>
            <h3 className="mt-1 text-xl font-semibold">{member.nickname}</h3>
            <p className="mt-2 text-sm text-muted-foreground">会员编号：{formatProtectedMemberNumber(member.member_number, adminRole === "super_admin")} · 会员状态：{member.member_status}</p>
            </div>
          </div>
          <div className="space-y-2 sm:w-72">
            <div className="text-sm text-muted-foreground">加入社区：{formatAdminDate(member.joined_at)}</div>
            {member.avatar_kind !== "default" ? (
              <div className="space-y-2">
                <input value={avatarResetReason} onChange={(event) => setAvatarResetReason(event.target.value)} placeholder="重置头像原因（必填）" className={COMMUNITY_ADMIN_INPUT_CLASS} />
                <Button variant="outline" size="sm" onClick={resetAvatar} disabled={pending} className="text-destructive hover:text-destructive"><RotateCcw className="size-4" />重置违规头像</Button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-label="社区活动统计" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CommunityMetricCard icon={MessageSquareText} label="树洞" value={member.stats.treeholes} />
        <CommunityMetricCard icon={Camera} label="照片动态" value={member.stats.photo_posts} />
        <CommunityMetricCard icon={MessageCircle} label="评论与回复" value={member.stats.comments} />
        <CommunityMetricCard icon={ShieldAlert} label="待处理举报" value={member.stats.pending_reports} tone={member.stats.pending_reports > 0 ? "warning" : "default"} />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <h3 className="font-semibold">执行社区限制</h3>
          {member.member_id ? (
            <div className="mt-4 space-y-4">
              <label>
                <span className={COMMUNITY_ADMIN_LABEL_CLASS}>处罚原因（会员将收到）</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className={COMMUNITY_ADMIN_INPUT_CLASS} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => sanction("warning")} disabled={pending}><ShieldAlert className="size-4" /> 警告</Button>
                <select value={muteDays} onChange={(event) => setMuteDays(Number(event.target.value) as 1 | 7 | 30)} aria-label="临时限制天数" className="min-h-9 rounded-lg border border-border bg-background px-2 text-sm">
                  <option value={1}>1 天</option><option value={7}>7 天</option><option value={30}>30 天</option>
                </select>
                <Button variant="outline" onClick={() => sanction("mute")} disabled={pending}><Gavel className="size-4" /> 临时限制</Button>
                {adminRole === "super_admin" ? (
                  <Button variant="destructive" onClick={() => {
                    if (window.confirm("确定永久禁止该会员使用社区？")) sanction("permanent_ban")
                  }} disabled={pending}><Gavel className="size-4" /> 永久封禁</Button>
                ) : null}
              </div>
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              {message ? <p role="status" className="text-sm text-primary">{message}</p> : null}
            </div>
          ) : <p className="mt-4 text-sm text-muted-foreground">原会员记录已不存在，不能继续处罚。</p>}
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <h3 className="font-semibold">昵称历史</h3>
          {member.nickname_history.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">尚未修改过昵称</p> : (
            <ol className="mt-4 space-y-3">
              {member.nickname_history.map((history) => (
                <li key={history.id} className="rounded-lg bg-muted/60 p-3 text-sm">
                  <p><span className="text-muted-foreground">{history.old_nickname}</span> → <span className="font-medium">{history.new_nickname}</span></p>
                  <time className="mt-1 block text-xs text-muted-foreground">{formatAdminDate(history.changed_at)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="font-semibold">处罚历史</h3>
        {member.sanctions.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">暂无处罚记录</p> : (
          <div className="mt-4 space-y-3">
            {member.sanctions.map((sanction) => {
              const active = sanction.is_active
              const mayRevoke = active && (sanction.sanction_type !== "permanent_ban" || adminRole === "super_admin")
              return (
                <article key={sanction.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{SANCTION_LABELS[sanction.sanction_type]}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>{active ? "生效中" : sanction.revoked_at ? "已解除" : "已到期"}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{sanction.reason}</p>
                      <p className="mt-2 text-xs text-muted-foreground">开始 {formatAdminDate(sanction.starts_at)}{sanction.ends_at ? ` · 结束 ${formatAdminDate(sanction.ends_at)}` : ""}</p>
                    </div>
                    {mayRevoke ? (
                      <div className="w-full space-y-2 sm:w-64">
                        <input value={revokeReasons[sanction.id] ?? ""} onChange={(event) => setRevokeReasons((current) => ({ ...current, [sanction.id]: event.target.value }))} placeholder="解除原因（必填）" className={COMMUNITY_ADMIN_INPUT_CLASS} />
                        <Button variant="outline" size="sm" onClick={() => revoke(sanction.id)} disabled={pending}>解除限制</Button>
                      </div>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
