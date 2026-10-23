"use client"

import { Info } from "lucide-react"
import { displayGender } from "./player-info-format"
import type { EnrichedMember, PairRelationship, SubmissionPrefInfo } from "./match-detail-types"

interface Props {
  memberA: EnrichedMember | null
  memberB: EnrichedMember | null
  groupMembers?: EnrichedMember[] | null
  pairRel?: PairRelationship | null
  bestSlot: string | null
  submissionPrefs?: Record<string, SubmissionPrefInfo>
}

function nameOf(member: EnrichedMember) {
  return member.member_identity?.full_name || member.member_identity?.nickname || "未知"
}

/** Saved cards expose a data summary, never infer whole-pool approval from partial details. */
export function ConstraintChecklist({ memberA, memberB, groupMembers, pairRel, bestSlot, submissionPrefs }: Props) {
  const isGroup = Boolean(groupMembers?.length)
  const members = isGroup ? groupMembers! : [memberA, memberB].filter((member): member is EnrichedMember => member !== null)
  const relationLabels: Record<string, string> = { blacklist: "黑名单", cooldown: "冷却期", reunion: "重逢", good_partner: "好搭档", avoid: "避免重复" }
  const items = [
    { label: "成员性别与偏好", details: members.map((member) => `${nameOf(member)}(${displayGender(member.member_identity?.gender)}) · 偏好：${submissionPrefs?.[member.id]?.gender_pref || "未填写"}`) },
    { label: "游戏类型偏好", details: members.map((member) => `${nameOf(member)}：${submissionPrefs?.[member.id]?.game_type_pref || "未填写"}`) },
    { label: "已保存时段", details: [bestSlot ? bestSlot.replace("_", " ") : "未保存推荐时段"] },
    { label: isGroup ? "关系资料范围" : "双人关系资料", details: isGroup
      ? ["此卡片未展示池内所有成员关系，不能据此判断整池无冲突。"]
      : [pairRel && pairRel.pair_count > 0 ? `历史 ${pairRel.pair_count} 次 · ${relationLabels[pairRel.status] ?? pairRel.status}${pairRel.avg_score != null ? ` · 均分 ${pairRel.avg_score.toFixed(1)}` : ""}` : "未显示历史关系记录"] },
  ]
  return <div className="rounded-lg border bg-muted/20 px-3 py-2 space-y-1.5 text-xs">
    <p className="font-medium text-muted-foreground">原批资料摘要；人工调整以对应操作快照为准</p>
    <p className="text-muted-foreground">以下是已保存结果的资料摘要，不代表当前资格或整池硬约束已通过；新操作将在服务端重新校验。</p>
    {items.map((item) => <div key={item.label}>
      <div className="flex items-center gap-1.5"><Info className="size-3.5 shrink-0 text-muted-foreground" /><span className="font-medium">{item.label}</span></div>
      {item.details.map((detail, index) => <p key={index} className="ml-5 text-muted-foreground">{detail}</p>)}
    </div>)}
  </div>
}
