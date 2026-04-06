"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { SectionHeader } from "./MemberDetailCard"
import { MemberEditIdentity } from "./MemberEditIdentity"
import { MemberEditLanguage } from "./MemberEditLanguage"
import { MemberEditInterests } from "./MemberEditInterests"
import { MemberEditPersonality } from "./MemberEditPersonality"
import { MemberEditBoundaries } from "./MemberEditBoundaries"
import {
  updateMemberIdentity,
  updateMemberLanguage,
  updateMemberInterests,
  updateMemberPersonality,
  updateMemberBoundaries,
} from "@/app/admin/members/[id]/edit/actions"

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props { memberId: string; member: any }

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
  const [success, setSuccess] = useState(false)

  const ev = member.interview_evaluations
  const verification = member.member_verification
  const [identity, setIdentity] = useState(member.member_identity ?? {})
  const [language, setLanguage] = useState(member.member_language ?? {})
  const [interests, setInterests] = useState(member.member_interests ?? {})
  const [personality, setPersonality] = useState(member.member_personality ?? {})
  const [boundaries, setBoundaries] = useState(member.member_boundaries ?? {})

  async function handleSave() {
    setSaving(true); setError(null); setSuccess(false)
    const results = await Promise.all([
      updateMemberIdentity(memberId, identity),
      updateMemberLanguage(memberId, language),
      updateMemberInterests(memberId, interests),
      updateMemberPersonality(memberId, personality),
      updateMemberBoundaries(memberId, boundaries),
    ])
    const failed = results.find((r) => r.error)
    if (failed) { setError(failed.error!) } else {
      setSuccess(true)
      setTimeout(() => router.push(`/admin/members/${memberId}`), 800)
    }
    setSaving(false)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 divide-y divide-border">
        {/* 1. 基本信息（可编辑） */}
        <div className="p-5 space-y-3">
          <SectionHeader title="基本信息" />
          <MemberEditIdentity data={identity} onChange={setIdentity} />
        </div>

        {/* 2. 面试评估（只读 — 走独立编辑页） */}
        <div className="p-5 space-y-3">
          <SectionHeader title="面试评估（只读）" color="amber" />
          {!ev ? <p className="text-sm text-muted-foreground">未评估</p> : (
            <table className="w-full"><tbody>
              <ReadOnlyRow label="面试官" value={ev.interviewer} />
              <ReadOnlyRow label="吸引力" value={ev.attractiveness_score} />
              <ReadOnlyRow label="风险等级" value={ev.risk_level} />
              <ReadOnlyRow label="总体推荐" value={ev.overall_recommendation} />
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
      {success && <p className="text-sm text-green-600">保存成功，正在跳转...</p>}

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving}
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
