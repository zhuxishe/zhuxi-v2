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
    if (failed) {
      setError(failed.error!)
    } else {
      setSuccess(true)
      setTimeout(() => router.push(`/admin/members/${memberId}`), 800)
    }
    setSaving(false)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <MemberEditIdentity data={identity} onChange={setIdentity} />
      <MemberEditLanguage data={language} onChange={setLanguage} />
      <MemberEditInterests data={interests} onChange={setInterests} />
      <MemberEditPersonality data={personality} onChange={setPersonality} />
      <MemberEditBoundaries data={boundaries} onChange={setBoundaries} />

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">保存成功，正在跳转...</p>}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? "保存中..." : "保存全部"}
        </button>
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  )
}
