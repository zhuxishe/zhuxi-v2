export interface RoundStats {
  total: number
  gameTypeDist: { duo: number; multi: number; either: number }
  slotCounts: Record<string, number>
  genderDist: { male: number; female: number; unspecified: number }
  genderPreferenceDist: { male: number; female: number; either: number; unspecified: number }
}

export interface RoundStatsSubmission {
  game_type_pref?: unknown
  gender_pref?: unknown
  availability?: unknown
  member?: unknown
  cancelled_at?: unknown
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function singleRelation(value: unknown): Record<string, unknown> | null {
  return record(Array.isArray(value) ? value.length === 1 ? value[0] : null : value)
}

/** Aggregate only current registrations; personal gender and this round's partner preference are independent. */
export function summarizeRoundStats(submissions: readonly RoundStatsSubmission[]): RoundStats {
  const result: RoundStats = {
    total: 0,
    gameTypeDist: { duo: 0, multi: 0, either: 0 },
    slotCounts: {},
    genderDist: { male: 0, female: 0, unspecified: 0 },
    genderPreferenceDist: { male: 0, female: 0, either: 0, unspecified: 0 },
  }

  for (const submission of submissions) {
    if (submission.cancelled_at != null) continue
    result.total++
    if (submission.game_type_pref === "双人") result.gameTypeDist.duo++
    else if (submission.game_type_pref === "多人") result.gameTypeDist.multi++
    else if (submission.game_type_pref === "都可以") result.gameTypeDist.either++

    const member = singleRelation(submission.member)
    const gender = singleRelation(member?.member_identity)?.gender
    if (gender === "male") result.genderDist.male++
    else if (gender === "female") result.genderDist.female++
    else result.genderDist.unspecified++

    if (submission.gender_pref === "男") result.genderPreferenceDist.male++
    else if (submission.gender_pref === "女") result.genderPreferenceDist.female++
    else if (submission.gender_pref === "都可以") result.genderPreferenceDist.either++
    else result.genderPreferenceDist.unspecified++

    const availability = record(submission.availability)
    if (!availability) continue
    for (const [date, slots] of Object.entries(availability)) {
      if (!Array.isArray(slots)) continue
      for (const slot of slots) {
        if (slot !== "上午" && slot !== "下午" && slot !== "晚上") continue
        const key = `${date}_${slot}`
        result.slotCounts[key] = (result.slotCounts[key] ?? 0) + 1
      }
    }
  }
  return result
}
