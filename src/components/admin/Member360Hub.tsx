import Link from "next/link"
import {
  Activity,
  ClipboardList,
  ExternalLink,
  History,
  MessagesSquare,
  Pencil,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AdminRole, Member360, MemberAuditEvent, MemberAuditPage, MemberCenterRecord } from "@/types"
import {
  MemberAccountAdvancedEditor,
  MemberLegacyAdvancedEditor,
  MemberQuizAdvancedEditor,
  MemberRolesAdvancedEditor,
  MemberWorkflowAdvancedEditor,
} from "./MemberAdvancedSectionEditors"
import { MemberAuditRestoreButton } from "./MemberAuditRestoreButton"
import { MemberDeleteButton } from "./MemberDeleteButton"
import { MemberDuplicateCandidateActions } from "./MemberDuplicateCandidateActions"
import { MemberNumberEditor } from "./MemberNumberEditor"
import { MemberStatusActions } from "./MemberStatusActions"
import { MemberStatusBadge } from "./MemberStatusBadge"
import {
  canRestoreMemberAudit,
  formatMemberValue,
  hasRestorableMemberAuditSnapshot,
  memberAuditActionLabel,
  memberAuditSectionLabel,
  memberFieldLabel,
  memberRecordEntries,
  MEMBER_360_TABS,
  type Member360Tab,
} from "./member-center-utils"

interface Props {
  data: Member360
  activeTab: Member360Tab
  adminRole: AdminRole
  auditPage: MemberAuditPage | null
}

function formatDate(value: string | null) {
  if (!value) return "未填写"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date)
}

function RecordPanel({ title, record, description }: {
  title: string
  record: MemberCenterRecord | null
  description?: string
}) {
  const entries = memberRecordEntries(record)
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-semibold">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">此分区尚无记录</p>
      ) : (
        <dl className="divide-y divide-border/70">
          {entries.map(([key, value]) => {
            const label = memberFieldLabel(key)
            return (
              <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
              <dt className={`text-xs font-medium text-muted-foreground ${label === key ? "font-mono" : ""}`}>{label}</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words text-sm">{formatMemberValue(value, key)}</dd>
            </div>
            )
          })}
        </dl>
      )}
    </section>
  )
}

function RecordCollection({ title, records, description }: {
  title: string
  records: MemberCenterRecord[]
  description?: string
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
        </div>
        <span className="text-xs text-muted-foreground">{records.length} 条</span>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {records.length > 0
          ? records.map((record, index) => (
              <RecordPanel key={String(record.id ?? index)} title={`记录 ${index + 1}`} record={record} />
            ))
          : <p className="text-sm text-muted-foreground">暂无记录</p>}
      </div>
    </section>
  )
}

function accountRecord(data: Member360, canViewHighRisk: boolean): MemberCenterRecord | null {
  if (!data.account) return null
  const routineFacts: MemberCenterRecord = {
    account_status: data.account.accountStatus,
    auth_bound: data.account.authBound,
    account_linked_at: data.account.accountLinkedAt,
    anonymized_at: data.account.anonymizedAt,
    record_source: data.account.recordSource,
  }
  if (!canViewHighRisk) return routineFacts
  return {
    ...data.account.raw,
    ...routineFacts,
    member_number: data.account.memberNumber,
    user_id: data.account.userId,
    auth_email: data.account.authEmail,
    auth_providers: data.account.authProviders,
    auth_created_at: data.account.authCreatedAt,
    auth_last_sign_in_at: data.account.authLastSignInAt,
    line_user_id: data.account.lineUserId,
    wechat_openid: data.account.wechatOpenid,
  }
}

function quizRecord(data: Member360, canViewHighRisk: boolean): MemberCenterRecord | null {
  if (!data.quiz || canViewHighRisk) return data.quiz
  const allowed = [
    "id", "member_id", "score_e", "score_a", "score_o", "score_c", "score_n",
    "personality_type", "completed_at", "created_at", "updated_at",
  ]
  return Object.fromEntries(
    allowed.filter((key) => key in data.quiz!).map((key) => [key, data.quiz![key]]),
  )
}

function memberRecord(data: Member360): MemberCenterRecord {
  const raw = Object.fromEntries(
    Object.entries(data.member.raw).filter(([key]) => key !== "status"),
  )
  return {
    ...raw,
    member_id: data.member.memberId,
    email: data.member.email,
    member_status: data.member.status,
    profile_stage: data.member.profileStage,
    record_source: data.member.recordSource,
    onboarding_step: data.member.onboardingStep,
    last_profile_saved_at: data.member.lastProfileSavedAt,
    submitted_at: data.member.submittedAt,
    membership_type: data.member.membershipType,
    created_at: data.member.createdAt,
    updated_at: data.member.updatedAt,
  }
}

function memberAuditDisplayRecord(
  record: MemberCenterRecord | null,
  section: unknown,
): MemberCenterRecord | null {
  if (!record || section !== "application" || !("status" in record)) return record
  const { status, ...rest } = record
  return { ...rest, member_status: status }
}

function AuditEventCard({ event, memberId, canRestore, canViewHighRisk }: {
  event: MemberAuditEvent
  memberId: string
  canRestore: boolean
  canViewHighRisk: boolean
}) {
  const eventId = event.id ?? event.event_id
  const title = event.action_type ?? event.action ?? event.operation ?? "member_change"
  const section = typeof event.section === "string" ? memberAuditSectionLabel(event.section) : null
  const valuesRedacted = event.values_redacted === true || (!canViewHighRisk && ["account", "quiz", "lifecycle"].includes(String(event.section ?? "")))
  const before = !valuesRedacted && event.before_values && typeof event.before_values === "object" ? event.before_values as MemberCenterRecord : null
  const after = !valuesRedacted && event.after_values && typeof event.after_values === "object" ? event.after_values as MemberCenterRecord : null
  const displayBefore = memberAuditDisplayRecord(before, event.section)
  const displayAfter = memberAuditDisplayRecord(after, event.section)
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs">#{String(eventId ?? "未知")}</span>
            <h3 className="font-semibold">{memberAuditActionLabel(String(title))}</h3>
            {section ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{section}</span> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {event.actor_name ?? "系统"} · {formatDate(event.created_at ?? null)}
          </p>
          <p className="mt-2 text-sm">原因：{event.reason ?? "未记录"}</p>
        </div>
        {canRestore && event.restorable === true && eventId !== undefined && hasRestorableMemberAuditSnapshot(before) ? (
          <div className="w-full max-w-md"><MemberAuditRestoreButton memberId={memberId} eventId={eventId} /></div>
        ) : null}
      </div>
      {valuesRedacted ? <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{canViewHighRisk ? "该成员已匿名化，旧个人身份信息的修改前后内容已按不可逆隐私策略裁剪" : "此事件的高风险修改前后内容因权限隐藏"}；事件、操作者、时间与原因仍可审计。</p> : null}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <RecordPanel title="修改前" record={displayBefore} />
        <RecordPanel title="修改后" record={displayAfter} />
      </div>
    </article>
  )
}

function safeCommunityRecord(record: MemberCenterRecord | null): MemberCenterRecord | null {
  if (!record) return null
  const allowed = [
    "profile_id", "nickname", "avatar_kind", "avatar_path", "preset_avatar", "joined_at",
    "non_anonymous_post_count", "non_anonymous_comment_count", "preferences",
  ]
  return Object.fromEntries(allowed.map((key) => [key, record[key]]))
}

function redactedFieldLabel(field: string) {
  const [section, ...parts] = field.split(".")
  const sectionLabel = memberAuditSectionLabel(section)
  if (parts.length === 0) return sectionLabel
  return `${sectionLabel}·${memberFieldLabel(parts.at(-1) ?? field)}`
}

export function Member360Hub({ data, activeTab, adminRole, auditPage }: Props) {
  const memberId = data.member.memberId
  const legacyName = data.legacyRecords.find((record) => typeof record.full_name === "string")?.full_name
  const name = typeof data.identity?.full_name === "string"
    ? data.identity.full_name
    : typeof legacyName === "string" ? legacyName : "未填写姓名"
  const nickname = typeof data.identity?.nickname === "string" ? data.identity.nickname : null
  const canRestore = canRestoreMemberAudit(adminRole, data.capabilities.isSuperAdmin)
  const isSuperAdmin = canRestore
  const isAnonymized = Boolean(data.account?.anonymizedAt)
  const canModifyHighRisk = isSuperAdmin && !isAnonymized
  const redactedFields = data.capabilities.redactedFields
  const auditEvents = auditPage?.items ?? data.audit

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
              {nickname ? <span className="text-sm text-muted-foreground">（{nickname}）</span> : null}
              <MemberStatusBadge status={data.member.status} />
            </div>
            <p className="mt-2 break-all text-xs text-muted-foreground">成员主记录 ID（<span className="font-mono">members.id</span>）：<span className="font-mono">{memberId}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">最后更新：{formatDate(data.member.updatedAt)}</p>
          </div>
          {!isAnonymized ? <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" render={<Link href={`/admin/members/${memberId}/edit`} />}><Pencil className="size-4" />编辑资料</Button>
            <Button size="sm" render={<Link href={`/admin/members/${memberId}/interview`} />}><ClipboardList className="size-4" />面试评估</Button>
            <Button size="sm" variant="outline" render={<Link href={`/admin/members/${memberId}/verify`} />}><ShieldCheck className="size-4" />核验</Button>
          </div> : <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">该成员已匿名化，资料编辑入口已关闭。</p>}
        </div>
      </header>

      <nav className="overflow-x-auto rounded-xl border border-border bg-card p-1" aria-label="成员 360 分区">
        <div className="flex min-w-max gap-1">
          {MEMBER_360_TABS.map((tab) => (
            <Link
              key={tab.value}
              href={`/admin/members/${memberId}?tab=${tab.value}`}
              aria-current={activeTab === tab.value ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activeTab === tab.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>

      {redactedFields.length > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {isSuperAdmin ? "匿名化隐私裁剪" : "权限隐藏"}：{redactedFields.map(redactedFieldLabel).join("、")}。这些值未返回，不代表数据库中的业务值为空。
        </p>
      ) : null}

      {activeTab === "overview" ? (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <RecordPanel title="成员主档" record={memberRecord(data)} />
            <RecordPanel title="登录账号" record={accountRecord(data, isSuperAdmin)} description={isSuperAdmin ? "超级管理员可查看完整账号信息；生命周期写操作仍需填写原因，并经过预检和审计。" : "普通管理员仅查看日常账号状态；会员编号、登录身份与外部绑定因权限隐藏。"} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryLink icon={UserRound} title="资料" detail={`阶段：${formatMemberValue(data.member.profileStage, "profile_stage")}`} href={`/admin/members/${memberId}?tab=profile`} />
            <SummaryLink icon={Activity} title="活动与匹配" detail={`匹配：${formatMemberValue(data.matching?.match_count)}`} href={`/admin/members/${memberId}?tab=activity`} />
            <SummaryLink icon={MessagesSquare} title="社区与反馈" detail={`反馈：${formatMemberValue(data.feedback?.total)}`} href={`/admin/members/${memberId}?tab=community`} />
            <SummaryLink icon={History} title="审计" detail={data.audit ? `${data.audit.length}/${data.auditTotal} 条` : "审计数据暂不可用"} href={`/admin/members/${memberId}?tab=audit`} />
          </div>
          {!isAnonymized ? <MemberStatusActions memberId={memberId} currentStatus={data.member.status} /> : null}
          {canModifyHighRisk ? <MemberNumberEditor memberId={memberId} memberNumber={data.account?.memberNumber ?? null} canEdit /> : null}
          {canModifyHighRisk ? <MemberAccountAdvancedEditor memberId={memberId} account={accountRecord(data, true) ?? {}} /> : null}
          {isSuperAdmin ? (
            <MemberDeleteButton
              memberId={memberId}
              memberName={name}
              accountStatus={data.account?.accountStatus ?? null}
              anonymizedAt={data.account?.anonymizedAt ?? null}
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === "profile" ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <RecordPanel title="基本与学业信息" record={data.identity} />
            <RecordPanel title="语言信息" record={data.language} />
            <RecordPanel title="兴趣与活动偏好" record={data.interests} />
            <RecordPanel title="性格自评" record={data.personality} />
            <RecordPanel title="个人边界" record={data.boundaries} />
            <RecordPanel title="人格测试" record={quizRecord(data, isSuperAdmin)} description={isSuperAdmin ? "包含当前玩家端人格测试记录与原始答案。" : "普通管理员可查看分数、类型与时间；原始答案因权限隐藏。"} />
          </div>
          {canModifyHighRisk ? <MemberQuizAdvancedEditor memberId={memberId} quiz={data.quiz} /> : null}
        </div>
      ) : null}

      {activeTab === "application" ? (
        <div className="space-y-4">
          <RecordPanel title="申请流程" record={memberRecord(data)} />
          <RecordPanel title="身份核验" record={data.verification} />
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">面试评估</h3><span className="text-xs text-muted-foreground">{data.interviewEvaluations.length} 份</span></div>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {data.interviewEvaluations.length > 0 ? data.interviewEvaluations.map((evaluation, index) => (
                <RecordPanel key={String(evaluation.id ?? index)} title={`评估 ${index + 1}`} record={evaluation} />
              )) : <p className="text-sm text-muted-foreground">尚无面试评估</p>}
            </div>
          </section>
          <RecordCollection
            title="团队成员公开档案"
            records={data.staffProfiles}
            description={isSuperAdmin ? "显示成员主档关联与完整公开档案。" : "显示公开业务字段；内部成员 ID 因权限隐藏。"}
          />
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">成员角色</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isSuperAdmin ? "显示完整角色历史；修改仍会单独审计。" : "显示只读业务角色信息；内部操作者 ID 与编辑能力因权限隐藏。"}
            </p>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {data.roles.length > 0 ? data.roles.map((role, index) => <RecordPanel key={String(role.id ?? index)} title={`角色 ${index + 1}`} record={role} />) : <p className="text-sm text-muted-foreground">尚无角色记录</p>}
            </div>
          </section>
          {data.legacyRecords.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold">历史来源记录</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {isSuperAdmin ? "显示完整历史原始记录及成员主档映射。" : "显示业务历史字段；历史编号、认领操作者与成员主档原始映射因权限隐藏。"}
              </p>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {data.legacyRecords.map((record, index) => <RecordPanel key={String(record.id ?? index)} title={`历史记录 ${index + 1}`} record={record} />)}
              </div>
            </section>
          ) : null}
          {canModifyHighRisk && data.legacyRecords.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {data.legacyRecords.map((record, index) => (
                <MemberLegacyAdvancedEditor
                  key={String(record.id ?? index)}
                  memberId={memberId}
                  legacyRecord={record}
                  recordNumber={index + 1}
                />
              ))}
            </div>
          ) : null}
          {canModifyHighRisk ? <MemberRolesAdvancedEditor memberId={memberId} roles={data.roles} /> : !isSuperAdmin ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">角色分配属于高风险权限操作；普通管理员可查看，但不提供编辑入口。</p>
          ) : null}
          {canModifyHighRisk ? <MemberWorkflowAdvancedEditor memberId={memberId} profileStage={data.member.profileStage} onboardingStep={data.member.onboardingStep} /> : null}
        </div>
      ) : null}

      {activeTab === "activity" ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <RecordPanel title="活动统计" record={data.dynamicStats} />
            <RecordPanel title="个人主页运营指标" record={data.profileMetrics} />
            <RecordPanel title="匹配与互评" record={data.matching} />
          </div>
          <RecordCollection title="匹配问卷" records={data.matchRoundSubmissions} />
          <RecordCollection title="未匹配原因诊断" records={data.unmatchedDiagnostics} />
          <RecordCollection title="剧本授权与参与记录" records={data.scriptPlayRecords} />
          <div className="flex flex-wrap gap-2">
            <ModuleLink href="/admin/activity-records" label="活动记录" />
            <ModuleLink href="/admin/matching" label="匹配管理" />
            <ModuleLink href="/admin/reviews" label="活动回顾" />
            <ModuleLink href={`/admin/members/${memberId}/stats`} label="成员统计" />
          </div>
        </div>
      ) : null}

      {activeTab === "community" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
            匿名内容保护：此处只展示非匿名社区资料与聚合计数；不会列出匿名内容对应的真实成员、作者映射或历史。
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <RecordPanel title="社区公开资料" record={safeCommunityRecord(data.community)} />
            <RecordPanel title="玩家反馈" record={data.feedback} />
          </div>
          <div className="flex flex-wrap gap-2">
            {typeof data.community?.profile_id === "string" ? <ModuleLink href={`/admin/community/members/${data.community.profile_id}`} label="社区成员页" /> : null}
            <ModuleLink href="/admin/community" label="社区管理" />
            <ModuleLink href="/admin/feedback" label="玩家反馈" />
          </div>
        </div>
      ) : null}

      {activeTab === "audit" ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">变更审计</h2>
            <p className="mt-1 text-sm text-muted-foreground">普通管理员与超级管理员均可逐页查看非匿名审计事件；账号、生命周期与人格测试原始值会按权限裁剪，仅超级管理员会显示恢复操作。</p>
          </section>
          {auditPage ? (
            <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              永久审计历史：共 {auditPage.total} 条，当前第 {auditPage.page}/{auditPage.totalPages || 1} 页；每页最多 {auditPage.pageSize} 条。
              {auditPage.redactedFields.length > 0 ? ` 本页权限裁剪：${auditPage.redactedFields.map(redactedFieldLabel).join("、")}。` : ""}
            </p>
          ) : null}
          {auditEvents && auditEvents.length > 0 ? auditEvents.map((event, index) => (
            <AuditEventCard key={String(event.id ?? event.event_id ?? index)} event={event} memberId={memberId} canRestore={canRestore} canViewHighRisk={isSuperAdmin} />
          )) : auditEvents ? <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">此页没有审计事件。</p> : <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">审计数据读取失败，请确认最新数据库迁移已部署。</p>}
          {auditPage ? <AuditPagination memberId={memberId} auditPage={auditPage} /> : null}
          {isSuperAdmin && data.duplicateCandidates.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-semibold">潜在重复记录</h2>
              <p className="mt-1 text-xs text-muted-foreground">仅供人工核对，不代表可自动合并。</p>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {data.duplicateCandidates.map((candidate, index) => {
                  const candidateId = typeof candidate.id === "number" || typeof candidate.id === "string" ? candidate.id : null
                  return (
                    <div key={String(candidateId ?? index)} className="space-y-2">
                      <RecordPanel title={`候选 ${index + 1}`} record={candidate} />
                      {candidateId !== null ? <MemberDuplicateCandidateActions memberId={memberId} candidateId={candidateId} status={typeof candidate.status === "string" ? candidate.status : null} /> : null}
                    </div>
                  )
                })}
              </div>
            </section>
          ) : !isSuperAdmin && redactedFields.some((field) => field.includes("duplicate")) ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">潜在重复候选因权限隐藏，仅超级管理员可进行人工核对。</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function AuditPagination({ memberId, auditPage }: { memberId: string; auditPage: MemberAuditPage }) {
  if (auditPage.totalPages <= 1) return null
  const first = Math.max(1, auditPage.page - 2)
  const last = Math.min(auditPage.totalPages, auditPage.page + 2)
  const pages = Array.from({ length: last - first + 1 }, (_, index) => first + index)
  const href = (page: number) => `/admin/members/${memberId}?tab=audit${page > 1 ? `&auditPage=${page}` : ""}`
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm" aria-label="审计历史分页">
      <span className="text-muted-foreground">第 {auditPage.page}/{auditPage.totalPages} 页</span>
      <div className="flex items-center gap-1">
        {auditPage.page > 1 ? <Link href={href(auditPage.page - 1)} className="rounded px-2 py-1 hover:bg-muted">上一页</Link> : <span className="px-2 py-1 text-muted-foreground/50">上一页</span>}
        {first > 1 ? <Link href={href(1)} className="rounded px-2 py-1 hover:bg-muted">1…</Link> : null}
        {pages.map((page) => <Link key={page} href={href(page)} aria-current={page === auditPage.page ? "page" : undefined} className={`rounded px-2 py-1 ${page === auditPage.page ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{page}</Link>)}
        {last < auditPage.totalPages ? <Link href={href(auditPage.totalPages)} className="rounded px-2 py-1 hover:bg-muted">…{auditPage.totalPages}</Link> : null}
        {auditPage.page < auditPage.totalPages ? <Link href={href(auditPage.page + 1)} className="rounded px-2 py-1 hover:bg-muted">下一页</Link> : <span className="px-2 py-1 text-muted-foreground/50">下一页</span>}
      </div>
    </nav>
  )
}

function SummaryLink({ icon: Icon, title, detail, href }: {
  icon: typeof Activity
  title: string
  detail: string
  href: string
}) {
  return (
    <Link href={href} className="rounded-xl border border-border bg-card p-4 transition hover:border-primary/30 hover:bg-muted/20">
      <div className="flex items-center gap-2"><Icon className="size-4 text-primary" aria-hidden="true" /><h3 className="font-semibold">{title}</h3></div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </Link>
  )
}

function ModuleLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted">{label}<ExternalLink className="size-3.5" aria-hidden="true" /></Link>
}
