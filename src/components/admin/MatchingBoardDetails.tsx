"use client"

import { Fragment, useId, type ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight, ChevronDown, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ScoreBreakdownChart } from "./ScoreBreakdownChart"
import { displayGender } from "./player-info-format"
import type { EnrichedMatchResult, EnrichedMember, SubmissionPrefInfo } from "./match-detail-types"

export interface MatchingBoardDetailsProps {
  members: EnrichedMember[]
  submissionPrefs: Record<string, Partial<SubmissionPrefInfo>>
  canViewRawSubmissions: boolean
  result?: EnrichedMatchResult
  sourceNote?: string
  onClose: () => void
}

interface DetailValue {
  content: ReactNode
  source?: string
}

interface DetailRow {
  label: string
  prominent?: boolean
  values: DetailValue[]
}

function nameOf(member: EnrichedMember): string {
  return member.member_identity?.full_name || member.member_identity?.nickname || "未知成员"
}

function textOrMissing(value: string | null | undefined): string {
  return value?.trim() || "未提供"
}

function Tags({ values }: { values: string[] | undefined }) {
  const tags = [...new Set((values ?? []).filter(Boolean))]
  if (tags.length === 0) return <span className="text-muted-foreground">未提供</span>
  return <div className="flex flex-wrap gap-1">
    {tags.map((tag) => <Badge key={tag} variant="outline" className="h-auto max-w-full break-words whitespace-normal py-0.5 font-normal">{tag}</Badge>)}
  </div>
}

function preferenceValue(
  submissionValue: string | undefined,
  profileValue: string | null | undefined,
): DetailValue {
  if (submissionValue !== undefined) return { content: textOrMissing(submissionValue), source: "本轮资料" }
  return { content: textOrMissing(profileValue), source: "成员档案" }
}

function availabilityValue(member: EnrichedMember, submission: Partial<SubmissionPrefInfo> | undefined): DetailValue {
  if (submission?.availability !== undefined) {
    const entries = Object.entries(submission.availability)
      .filter(([, slots]) => slots.length > 0)
      .sort(([a], [b]) => a.localeCompare(b))
    return {
      content: entries.length > 0 ? <ul className="space-y-1">
        {entries.map(([date, slots]) => <li key={date}><span className="font-medium tabular-nums">{date}</span><span className="ml-2">{slots.join("、")}</span></li>)}
      </ul> : <span className="text-muted-foreground">本轮未提供可用日期与时段</span>,
      source: "本轮已选日期与时段",
    }
  }
  const slots = member.member_interests?.preferred_time_slots ?? []
  return {
    content: slots.length > 0 ? <Tags values={slots.map((slot) => slot.replace("_", " "))} /> : <span className="text-muted-foreground">未提供可用时间</span>,
    source: "成员档案时间偏好，非本轮已选时间",
  }
}

/** Mount outside the pool columns so a pair has enough room for aligned comparison. */
export function MatchingBoardDetails({ members, submissionPrefs, canViewRawSubmissions, result, onClose, sourceNote }: MatchingBoardDetailsProps) {
  const titleId = useId()
  const people = members.slice(0, 2)
  const isPair = people.length === 2
  const cancelled = result?.status === "cancelled"
  const gridClass = isPair
    ? "grid-cols-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]"
    : "grid-cols-1 sm:grid-cols-[7rem_minmax(0,1fr)]"
  // Keep this guard even though the page also removes raw submissions server-side.
  const prefs = people.map((member) => canViewRawSubmissions ? submissionPrefs[member.id] : undefined)
  const rows: DetailRow[] = [
    { label: "本人性别", prominent: true, values: people.map((member) => ({ content: displayGender(member.member_identity?.gender), source: "成员档案" })) },
    { label: "意向搭档性别", prominent: true, values: people.map((member, index) => preferenceValue(prefs[index]?.gender_pref, member.member_boundaries?.preferred_gender_mix)) },
    { label: "可用日期与时段", prominent: true, values: people.map((member, index) => availabilityValue(member, prefs[index])) },
    { label: "游戏偏好", values: people.map((member, index) => preferenceValue(prefs[index]?.game_type_pref, member.member_interests?.game_type_pref)) },
    { label: "题材偏好", values: people.map((member, index) => ({ content: <Tags values={prefs[index]?.interest_tags ?? member.member_interests?.scenario_theme_tags} />, source: prefs[index]?.interest_tags !== undefined ? "本轮资料" : "成员档案" })) },
    { label: "兴趣", values: people.map((member) => ({ content: <Tags values={member.member_identity?.hobby_tags} /> })) },
    { label: "学校与学部", values: people.map((member) => ({ content: [member.member_identity?.school_name, member.member_identity?.department, member.member_identity?.degree_level].filter(Boolean).join(" · ") || "未提供" })) },
    { label: "国籍", values: people.map((member) => ({ content: textOrMissing(member.member_identity?.nationality) })) },
    { label: "社交目标", values: people.map((member) => ({ content: textOrMissing(member.member_interests?.social_goal_primary) })) },
    { label: "社交风格", values: people.map((member, index) => preferenceValue(prefs[index]?.social_style ?? undefined, member.member_personality?.warmup_speed)) },
    { label: "表达风格", values: people.map((member) => ({ content: <Tags values={member.member_personality?.expression_style_tags} /> })) },
    { label: "团队角色", values: people.map((member) => ({ content: <Tags values={member.member_personality?.group_role_tags} /> })) },
    { label: "外向度", values: people.map((member) => {
      const score = member.member_personality?.extroversion
      return { content: typeof score === "number" && Number.isFinite(score) && score >= 1 && score <= 5 ? `${score} / 5` : "未提供", source: "成员性格自评" }
    }) },
  ]

  if (people.length === 0) return null

  return <section aria-labelledby={titleId} className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm" onKeyDown={(event) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      onClose()
    }
  }}>
    <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
      <div className="min-w-0">
        <h3 id={titleId} className="break-words text-sm font-semibold">{people.map(nameOf).join(" & ")}<span className="ml-2 font-normal text-muted-foreground">{isPair ? "资料对比" : "个人资料"}</span></h3>
        <p className="mt-1 text-xs text-muted-foreground">{canViewRawSubmissions ? (sourceNote ?? "优先展示本轮资料；未提供时注明档案来源。") : "本轮问卷内容仅超级管理员可见，以下展示成员档案。"}</p>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="关闭个人资料" onClick={onClose}><X className="size-4" /></Button>
    </div>
    <div className="max-h-[65vh] overflow-y-auto overscroll-contain">
      {result ? <div className="space-y-1 border-b bg-muted/30 px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
          <p><span className="text-muted-foreground">{cancelled ? "原配对时间" : "共同时间"}：</span><span className="font-medium">{result.best_slot?.replace("_", " ") || "未记录"}</span></p>
          <p><span className="text-muted-foreground">{cancelled ? "原配对评分" : "匹配评分"}：</span><span className="font-semibold tabular-nums">{Number.isFinite(result.total_score) ? result.total_score.toFixed(1) : "未记录"}</span></p>
        </div>
        {cancelled ? <p className="text-muted-foreground">配对已解除，以上为原配对记录。</p> : null}
      </div> : null}
      <div className={cn("grid gap-x-3 border-b px-4 py-3 sm:gap-x-5", gridClass)}>
        <div className="hidden sm:block" />
        {people.map((member) => <div key={member.id} className="min-w-0">
          <p className="break-words text-sm font-semibold">{nameOf(member)}</p>
          {member.member_identity?.nickname && member.member_identity.nickname !== member.member_identity.full_name ? <p className="mt-0.5 break-words text-xs text-muted-foreground">昵称：{member.member_identity.nickname}</p> : null}
          <Link href={`/admin/members/${member.id}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-0.5 text-xs text-primary underline-offset-4 hover:underline" aria-label={`查看${nameOf(member)}的完整资料（新标签页）`}>查看完整资料<ArrowUpRight className="size-3" /></Link>
        </div>)}
      </div>
      <dl className="divide-y divide-border/60">
        {rows.map((row) => <div key={row.label} className={cn("grid gap-x-3 gap-y-1.5 px-4 py-2.5 text-xs sm:gap-x-5", gridClass, row.prominent && "bg-primary/[0.025]")}>
          <dt className={cn("font-medium text-muted-foreground sm:col-span-1", isPair && "col-span-2")}>{row.label}</dt>
          {row.values.map((value, index) => <dd key={people[index].id} className="min-w-0 break-words leading-relaxed">
            {value.content}
            {value.source ? <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{value.source}</p> : null}
          </dd>)}
        </div>)}
      </dl>
      {canViewRawSubmissions && result?.score_breakdown != null ? <details className="group border-t px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium [&::-webkit-details-marker]:hidden">评分明细<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /></summary>
        <div className="mt-3"><ScoreBreakdownChart breakdown={result.score_breakdown} /></div>
      </details> : null}
      {canViewRawSubmissions && people.some((member) => member.import_info) ? <details className="group border-t px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium [&::-webkit-details-marker]:hidden">导入资料<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /></summary>
        <div className={cn("mt-3 grid gap-4", isPair && "sm:grid-cols-2")}>
          {people.map((member) => <Fragment key={member.id}>{member.import_info ? <ImportDetails member={member} /> : <p className="text-xs text-muted-foreground">{nameOf(member)}：无导入资料</p>}</Fragment>)}
        </div>
      </details> : null}
    </div>
  </section>
}

function ImportDetails({ member }: { member: EnrichedMember }) {
  const info = member.import_info!
  const sourceLabels = { "legacy-temp": "老成员补强", temp: "纯导入临时成员", current: "当前正式成员" }
  return <div className="min-w-0 space-y-1.5 break-words rounded-lg bg-muted/30 p-3 text-xs">
    <p className="font-medium">{nameOf(member)} · {sourceLabels[info.source]}</p>
    <p className="text-muted-foreground">{info.inferred ? "按导入规则推断的来源，原库未保存导入元数据。" : "来自导入时保存的元数据。"}</p>
    {info.raw_first_choice || info.raw_second_choice ? <p>原始志愿：{[info.raw_first_choice, info.raw_second_choice].filter(Boolean).join(" / ")}</p> : null}
    {info.script_activity_pref ? <p>剧本与活动倾向：{info.script_activity_pref}</p> : null}
    {info.raw_notes ? <p>导入备注：{info.raw_notes}</p> : null}
    {info.warnings.length > 0 ? <p className="text-amber-700">{info.warnings.join("、")}</p> : null}
  </div>
}
