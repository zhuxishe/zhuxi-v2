"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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

const COLORS: Record<string, string> = {
  primary: "bg-primary/10 text-primary border-primary/20",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
}

function Header({ title, color = "primary" }: { title: string; color?: string }) {
  return <div className={`px-3 py-1.5 text-xs font-semibold rounded-md border ${COLORS[color]}`}>{title}</div>
}

export function MemberEditForm({ memberId, member }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [identity, setIdentity] = useState(member.member_identity ?? {})
  const [language, setLanguage] = useState(member.member_language ?? {})
  const [interests, setInterests] = useState(member.member_interests ?? {})
  const [personality, setPersonality] = useState(member.member_personality ?? {})
  const [boundaries, setBoundaries] = useState(member.member_boundaries ?? {})

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)
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
        <div className="p-5 space-y-3">
          <Header title="基本信息 / 学业" />
          <MemberEditIdentity data={identity} onChange={setIdentity} />
        </div>
        <div className="p-5 space-y-3">
          <Header title="补充信息 — 语言" color="violet" />
          <MemberEditLanguage data={language} onChange={setLanguage} />
        </div>
        <div className="p-5 space-y-3">
          <Header title="补充信息 — 活动偏好" color="violet" />
          <MemberEditInterests data={interests} onChange={setInterests} />
        </div>
        <div className="p-5 space-y-3">
          <Header title="性格评价" color="primary" />
          <MemberEditPersonality data={personality} onChange={setPersonality} />
        </div>
        <div className="p-5 space-y-3">
          <Header title="个人边界" color="rose" />
          <MemberEditBoundaries data={boundaries} onChange={setBoundaries} />
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
