export interface MiniActivityRow {
  id: string
  title: string | null
  location: string | null
  activity_date: string | null
  participant_ids?: string[] | null
}

export interface MiniActivityItem {
  id: string
  title: string
  location: string
  activityDate: string
}

export function normalizeMiniActivities(rows: MiniActivityRow[] | null | undefined): MiniActivityItem[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title?.trim() || '未命名活动',
    location: row.location?.trim() || '地点待补充',
    activityDate: (row.activity_date || '').slice(0, 10),
  }))
}

export function filterMiniActivitiesByMember(
  rows: MiniActivityRow[] | null | undefined,
  memberId: string
) {
  return normalizeMiniActivities(
    (rows ?? []).filter((row) => Array.isArray(row.participant_ids) && row.participant_ids.includes(memberId))
  )
}
