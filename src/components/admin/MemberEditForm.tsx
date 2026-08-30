"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { SectionHeader } from "./MemberDetailCard"
import { MemberEditIdentity } from "./MemberEditIdentity"
import { MemberEditLanguage } from "./MemberEditLanguage"
import { MemberEditInterests } from "./MemberEditInterests"
import { MemberEditPersonality } from "./MemberEditPersonality"
import { MemberEditBoundaries } from "./MemberEditBoundaries"
import { MemberEditApplication, type MemberApplicationEditData } from "./MemberEditApplication"
import {
  updateMemberIdentity,
  updateMemberLanguage,
  updateMemberInterests,
  updateMemberPersonality,
  updateMemberBoundaries,
  updateMemberApplication,
} from "@/app/admin/members/[id]/edit/actions"
import type { MemberDetail, InterviewEvaluationRow } from "@/types"

interface Props { memberId: string; member: MemberDetail }

const INITIAL_IDENTITY_FIELDS = [
  ["full_name", "姓名"],
  ["gender", "性别"],
  ["age_range", "年龄段"],
  ["nationality", "国籍"],
  ["current_city", "所在地"],
] as const

export function missingInitialIdentityFields(data: Record<string, unknown>): string[] {
  return INITIAL_IDENTITY_FIELDS
    .filter(([field]) => {
      const value = data[field]
      if (field === "gender") return !["male", "female", "other"].includes(String(value ?? ""))
      return typeof value !== "string" || value.trim().length === 0
    })
    .map(([, label]) => label)
}

function ReadOnlyRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap w-24">{label}</td>
      <td className="py-2 text-sm">{value ?? <span className="text-muted-foreground">-</span>}</td>
    </tr>
  )
}

export function MemberEditForm({ memberId, member }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  const rawEvals = member.interview_evaluations
  const evals = Array.isArray(rawEvals) ? rawEvals : rawEvals ? [rawEvals] : []
  const verification = member.member_verification
  const [identity, setIdentity] = useState(member.member_identity ?? {})
  const [language, setLanguage] = useState(member.member_language ?? {})
  const [interests, setInterests] = useState(member.member_interests ?? {})
  const [personality, setPersonality] = useState(member.member_personality ?? {})
  const [boundaries, setBoundaries] = useState(member.member_boundaries ?? {})
  const originalApplication: MemberApplicationEditData = {
    interview_date: member.interview_date,
    interviewer: member.interviewer,
    attractiveness_score: member.attractiveness_score,
  }
  const [application, setApplication] = useState(originalApplication)

  async function handleSave() {
    if (reason.trim().length < 4) {
      setError("请填写至少 4 个字符的修改原因")
      return
    }
    const identityChanged = JSON.stringify(identity) !== JSON.stringify(member.member_identity ?? {})
    const hasPersistedIdentity = Boolean(
      member.member_identity && Object.keys(member.member_identity).length > 0,
    )
    if (identityChanged && !hasPersistedIdentity) {
      const missing = missingInitialIdentityFields(identity)
      if (missing.length > 0) {
        setError(`首次建立基本信息时，请同时填写：${missing.join("、")}`)
        return
      }
    }

    setSaving(true); setError(null)
    const updates = [
      ["基本信息", identityChanged, () => updateMemberIdentity(memberId, identity, reason)],
      ["语言", JSON.stringify(language) !== JSON.stringify(member.member_language ?? {}), () => updateMemberLanguage(memberId, language, reason)],
      ["兴趣", JSON.stringify(interests) !== JSON.stringify(member.member_interests ?? {}), () => updateMemberInterests(memberId, interests, reason)],
      ["性格", JSON.stringify(personality) !== JSON.stringify(member.member_personality ?? {}), () => updateMemberPersonality(memberId, personality, reason)],
      ["个人边界", JSON.stringify(boundaries) !== JSON.stringify(member.member_boundaries ?? {}), () => updateMemberBoundaries(memberId, boundaries, reason)],
      ["申请信息", JSON.stringify(application) !== JSON.stringify(originalApplication), () => updateMemberApplication(memberId, application, reason)],
    ] as const
    const changedUpdates = updates.filter(([, changed]) => changed)
    if (changedUpdates.length === 0) {
      setSaving(false)
      setError("没有检测到资料变更")
      return
    }
    const completedLabels: string[] = []
    for (const [label, , update] of changedUpdates) {
      const result = await update()
      if (result.error) {
        setSaving(false)
        const progress = completedLabels.length > 0
          ? `此前已完成并记录审计的分区：${completedLabels.join("、")}。请刷新后核对。`
          : "本次尚未保存任何分区。"
        setError(`${label}保存失败：${result.error}。${progress}`)
        return
      }
      completedLabels.push(label)
    }
    setSaving(false)
    router.push(`/admin/members/${memberId}`)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 divide-y divide-border">
        {/* 1. 基本信息（可编辑） */}
        <div className="p-5 space-y-3">
          <SectionHeader title="基本信息" />
          <MemberEditIdentity data={identity} onChange={setIdentity} />
        </div>

        {/* 2. 申请流程字段（可编辑） */}
        <div className="p-5 space-y-3">
          <SectionHeader title="申请流程字段" color="amber" />
          <MemberEditApplication data={application} onChange={setApplication} />
        </div>

        {/* 3. 面试评估（只读 — 走独立编辑页） */}
        <div className="p-5 space-y-3">
          <SectionHeader title="面试评估（只读）" color="amber" />
          {!evals.length ? <p className="text-sm text-muted-foreground">未评估</p> : (
            <table className="w-full"><tbody>
              <ReadOnlyRow label="评估数" value={`${evals.length} 份`} />
              {evals.map((e: InterviewEvaluationRow, i: number) => (
                <ReadOnlyRow key={i} label={e.interviewer_name ?? `面试官${i + 1}`} value={`推荐 ${e.overall_recommendation}/5 · 风险 ${e.risk_level}`} />
              ))}
            </tbody></table>
          )}
        </div>

        {/* 3. 补充信息（可编辑） */}
        <div className="p-5 space-y-3">
          <SectionHeader title="补充信息" color="violet" />
          <MemberEditLanguage data={language} onChange={setLanguage} />
          <MemberEditInterests data={interests} onChange={setInterests} />
        </div>

        {/* 4. 性格评价（可编辑） */}
        <div className="p-5 space-y-3">
          <SectionHeader title="性格评价" color="blue" />
          <MemberEditPersonality data={personality} onChange={setPersonality} />
        </div>

        {/* 5. 个人边界（可编辑） */}
        <div className="p-5 space-y-3">
          <SectionHeader title="个人边界" color="rose" />
          <MemberEditBoundaries data={boundaries} onChange={setBoundaries} />
        </div>

        {/* 6. 验证状态（只读 — 走独立验证页） */}
        <div className="p-5 space-y-3">
          <SectionHeader title="验证状态（只读）" color="primary" />
          {!verification ? <p className="text-sm text-muted-foreground">未验证</p> : (
            <table className="w-full"><tbody>
              <ReadOnlyRow label="学生证" value={verification.student_id_verified ? "已验证" : "未验证"} />
              <ReadOnlyRow label="照片" value={verification.photo_verified ? "已验证" : "未验证"} />
            </tbody></table>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <label className="block rounded-xl border border-border bg-card p-4">
        <span className="text-sm font-semibold">本次修改原因（必填）</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="例如：根据本人 2026-08-30 提交的更正申请更新资料"
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          disabled={saving}
        />
        <span className="mt-1 block text-xs text-muted-foreground">原因会写入每个变更分区的审计记录。</span>
      </label>

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving || reason.trim().length < 4}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {saving ? "保存中..." : "保存全部"}
        </button>
        <button onClick={() => router.back()}
          className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors">
          取消
        </button>
      </div>
    </div>
  )
}
