"use client"

import Link from "next/link"
import { Eye, EyeOff, Pencil, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RoundRecord } from "@/types"
import { getRoundPurpose, normalizeRoundConfig } from "@/lib/matching/round-config"
import { formatSurveyTime } from "@/lib/matching/survey-window"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { canRunRoundMatching } from "../round-detail-rules"
import { RoundStatusBadge } from "./RoundStatusBadge"

interface Props {
  round: RoundRecord; windowState: string; loading: boolean; count: number; matchingReason: string
  onOpen: () => void; onClose: () => void; onMatch: () => void
}

export function RoundDetailHeader({ round, windowState, loading, count, matchingReason, onOpen, onClose, onMatch }: Props) {
  const purpose = getRoundPurpose(round.purpose)
  const config = normalizeRoundConfig(round.content_config)
  const noun = purpose === "matching" ? "问卷" : purpose === "registration" ? "报名" : "通知"
  return <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <div className="mb-1 flex items-center gap-2"><h2 className="text-lg font-bold">{round.round_name}</h2><RoundStatusBadge status={windowState} /></div>
      <p className="text-xs text-muted-foreground">{noun}（日本时间）: {formatSurveyTime(round.survey_start)} ~ {formatSurveyTime(round.survey_end)}</p>
      <p className="text-xs text-muted-foreground">活动: {purpose !== "matching" && config.eventStart ? `${formatSurveyTime(config.eventStart)} ~ ${formatSurveyTime(config.eventEnd)}（日本时间）` : `${round.activity_start} ~ ${round.activity_end}`}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Link href={`/admin/matching/rounds/${round.id}/edit`}><Button size="sm" variant="outline"><Pencil className="mr-1 size-4" />内容、问卷与预览</Button></Link>
      {(round.status === "draft" || round.status === "closed" || windowState === "expired") && <Button size="sm" onClick={onOpen} disabled={loading}><Eye className="mr-1 size-4" />{round.status === "draft" ? "开放" : "重新开放"}{noun}</Button>}
      {round.status === "open" && <Button size="sm" variant="outline" onClick={onClose} disabled={loading}><EyeOff className="mr-1 size-4" />{purpose === "announcement" ? "下架通知" : `截止${noun}`}</Button>}
      {purpose === "matching" && canRunRoundMatching(round.status) && <Button size="sm" onClick={onMatch} disabled={loading || count < 2 || !adminAuditReasonIsValid(matchingReason)}><Play className="mr-1 size-4" />运行匹配</Button>}
    </div>
  </div>
}
