"use client"

import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { displayGender } from "./player-info-format"
import type { EnrichedMember, PairRelationship, SubmissionPrefInfo } from "./match-detail-types"

interface ConstraintItem {
  label: string
  status: "pass" | "fail" | "warn"
  details: string[]
}

interface Props {
  memberA: EnrichedMember | null
  memberB: EnrichedMember | null
  /** 多人组成员（有值时使用组模式而非 A vs B） */
  groupMembers?: EnrichedMember[] | null
  pairRel?: PairRelationship | null
  bestSlot: string | null
  submissionPrefs?: Record<string, SubmissionPrefInfo>
}

function nameOf(m: EnrichedMember | null): string {
  return m?.member_identity?.full_name || m?.member_identity?.nickname || "未知"
}

/** 单向性别兼容检查：pref 是否接受 targetGender */
function isGenderOk(pref: string, targetGender: string): boolean {
  if (pref === "都可以") return true
  if (!targetGender || targetGender === "未知") return true
  // 统一到中文再比较
  const normTarget = displayGender(targetGender)
  return pref === normTarget
}

function checkGender(
  a: EnrichedMember | null, b: EnrichedMember | null,
  prefs?: Record<string, { game_type_pref: string; gender_pref: string }>,
): ConstraintItem {
  const aGenderRaw = a?.member_identity?.gender || "未知"
  const bGenderRaw = b?.member_identity?.gender || "未知"
  const aGender = displayGender(aGenderRaw)
  const bGender = displayGender(bGenderRaw)
  // 只从问卷读取性别偏好（只有填了问卷的人才参与匹配）
  const aPref = (a?.id && prefs?.[a.id]?.gender_pref) ?? "未填写"
  const bPref = (b?.id && prefs?.[b.id]?.gender_pref) ?? "未填写"

  const aOk = isGenderOk(bPref, aGenderRaw)
  const bOk = isGenderOk(aPref, bGenderRaw)

  return {
    label: "性别兼容",
    status: aOk && bOk ? "pass" : "fail",
    details: [
      `${nameOf(a)}(${aGender}) → ${nameOf(b)}偏好: ${bPref} ${aOk ? "✓" : "✗"}`,
      `${nameOf(b)}(${bGender}) → ${nameOf(a)}偏好: ${aPref} ${bOk ? "✓" : "✗"}`,
    ],
  }
}

function checkGameType(
  a: EnrichedMember | null, b: EnrichedMember | null,
  prefs?: Record<string, { game_type_pref: string; gender_pref: string }>,
): ConstraintItem {
  // 只从问卷读取游戏类型偏好
  const aPref = (a?.id && prefs?.[a.id]?.game_type_pref) ?? "未填写"
  const bPref = (b?.id && prefs?.[b.id]?.game_type_pref) ?? "未填写"

  // 双人配对中：双方都选"多人"应标记不兼容（他们想要多人组）
  const bothMulti = aPref === "多人" && bPref === "多人"
  const compatible = !bothMulti && (
    aPref === "都可以" || bPref === "都可以" ||
    aPref === bPref ||
    (aPref.startsWith("双人") && bPref.startsWith("双人"))
  )

  return {
    label: "游戏类型",
    status: compatible ? "pass" : bothMulti ? "warn" : "fail",
    details: [
      `${nameOf(a)}: ${aPref} ↔ ${nameOf(b)}: ${bPref}`,
      ...(bothMulti ? ["双方都选多人，不应配成双人对"] : []),
    ],
  }
}

function checkTimeSlot(bestSlot: string | null): ConstraintItem {
  return {
    label: "共同时段",
    status: bestSlot ? "pass" : "fail",
    details: [bestSlot ? bestSlot.replace("_", " ") : "无共同可用时段"],
  }
}

function checkPairRelation(rel?: PairRelationship | null): ConstraintItem {
  if (!rel || rel.pair_count === 0) {
    return { label: "配对关系", status: "pass", details: ["无历史记录"] }
  }

  const STATUS_MAP: Record<string, { status: ConstraintItem["status"]; text: string }> = {
    blacklist: { status: "fail", text: "黑名单" },
    cooldown: { status: "fail", text: "冷却期（双五分后需跳过一轮）" },
    reunion: { status: "pass", text: "重逢配对（+30分加成）" },
    good_partner: { status: "pass", text: "好搭档" },
    avoid: { status: "warn", text: "建议避免重复（第一轮跳过）" },
  }

  const info = STATUS_MAP[rel.status] ?? { status: "pass" as const, text: rel.status }
  const countText = `历史 ${rel.pair_count} 次`
  const scoreText = rel.avg_score != null ? ` · 均分 ${rel.avg_score.toFixed(1)}` : ""

  return {
    label: "配对关系",
    status: info.status,
    details: [`${countText}${scoreText} · ${info.text}`],
  }
}

const STATUS_ICON = {
  pass: <CheckCircle2 className="size-3.5 text-green-600 shrink-0" />,
  fail: <XCircle className="size-3.5 text-red-600 shrink-0" />,
  warn: <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />,
}

/** 多人组：汇总所有成员偏好 */
function checkGroupPrefs(
  members: EnrichedMember[],
  prefs?: Record<string, { game_type_pref: string; gender_pref: string }>,
): ConstraintItem[] {
  const items: ConstraintItem[] = []

  // 性别分布
  const genders = members.map((m) => `${nameOf(m)}(${displayGender(m.member_identity?.gender)})`)
  const genderPrefs = members.map((m) => {
    const pref = (m.id && prefs?.[m.id]?.gender_pref) ?? "未填写"
    return `${nameOf(m)}: ${pref}`
  })
  items.push({ label: "性别分布", status: "pass", details: [genders.join("、"), "偏好: " + genderPrefs.join("、")] })

  // 游戏类型
  const gamePrefs = members.map((m) => {
    const pref = (m.id && prefs?.[m.id]?.game_type_pref) ?? "未填写"
    return `${nameOf(m)}: ${pref}`
  })
  const allMulti = members.every((m) => {
    const p = m.id && prefs?.[m.id]?.game_type_pref
    return p === "多人" || p === "都可以"
  })
  items.push({ label: "游戏类型", status: allMulti ? "pass" : "warn", details: gamePrefs })

  return items
}

export function ConstraintChecklist({ memberA, memberB, groupMembers, pairRel, bestSlot, submissionPrefs }: Props) {
  const isGroup = groupMembers && groupMembers.length > 0

  const items: ConstraintItem[] = isGroup
    ? [
        ...checkGroupPrefs(groupMembers, submissionPrefs),
        checkTimeSlot(bestSlot),
        checkPairRelation(pairRel),
      ]
    : [
        checkGender(memberA, memberB, submissionPrefs),
        checkGameType(memberA, memberB, submissionPrefs),
        checkTimeSlot(bestSlot),
        checkPairRelation(pairRel),
      ]

  const allPassed = items.every((i) => i.status === "pass")

  return (
    <div className={cn(
      "rounded-lg border px-3 py-2 space-y-1.5 text-xs",
      allPassed ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-amber-50/50",
    )}>
      <p className="font-medium text-muted-foreground">约束检查</p>
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-center gap-1.5">
            {STATUS_ICON[item.status]}
            <span className={cn(
              "font-medium",
              item.status === "fail" && "text-red-700",
              item.status === "warn" && "text-amber-700",
            )}>
              {item.label}
            </span>
          </div>
          {item.details.map((d, i) => (
            <p key={i} className="ml-5 text-muted-foreground">{d}</p>
          ))}
        </div>
      ))}
    </div>
  )
}
