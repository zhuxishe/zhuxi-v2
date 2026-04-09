"use client"

import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { EnrichedMember, PairRelationship } from "./match-detail-types"

interface ConstraintItem {
  label: string
  status: "pass" | "fail" | "warn"
  details: string[]
}

interface Props {
  memberA: EnrichedMember | null
  memberB: EnrichedMember | null
  pairRel?: PairRelationship | null
  bestSlot: string | null
}

function nameOf(m: EnrichedMember | null): string {
  return m?.member_identity?.full_name || m?.member_identity?.nickname || "未知"
}

function checkGender(a: EnrichedMember | null, b: EnrichedMember | null): ConstraintItem {
  const aGender = a?.member_identity?.gender || "未知"
  const bGender = b?.member_identity?.gender || "未知"
  const aPref = a?.member_boundaries?.preferred_gender_mix || "都可以"
  const bPref = b?.member_boundaries?.preferred_gender_mix || "都可以"

  const aOk = bPref === "都可以" || !bGender || bPref === aGender
  const bOk = aPref === "都可以" || !aGender || aPref === bGender

  return {
    label: "性别兼容",
    status: aOk && bOk ? "pass" : "fail",
    details: [
      `${nameOf(a)}(${aGender}) → ${nameOf(b)}偏好: ${bPref} ${aOk ? "✓" : "✗"}`,
      `${nameOf(b)}(${bGender}) → ${nameOf(a)}偏好: ${aPref} ${bOk ? "✓" : "✗"}`,
    ],
  }
}

function checkGameType(a: EnrichedMember | null, b: EnrichedMember | null): ConstraintItem {
  const aPref = a?.member_interests?.game_type_pref || "都可以"
  const bPref = b?.member_interests?.game_type_pref || "都可以"

  const compatible =
    aPref === "都可以" || bPref === "都可以" ||
    aPref === bPref ||
    (aPref.startsWith("双人") && bPref.startsWith("双人")) ||
    (aPref.startsWith("多人") && bPref.startsWith("多人"))

  return {
    label: "游戏类型",
    status: compatible ? "pass" : "fail",
    details: [`${nameOf(a)}: ${aPref} ↔ ${nameOf(b)}: ${bPref}`],
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

export function ConstraintChecklist({ memberA, memberB, pairRel, bestSlot }: Props) {
  const items: ConstraintItem[] = [
    checkGender(memberA, memberB),
    checkGameType(memberA, memberB),
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
