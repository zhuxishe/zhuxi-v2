import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export interface ActivityRegistrationLinkSummary {
  id: string
  title: string
  archived?: boolean
}

export type ActivityRegistrationLinkSummaries = Partial<Record<string, ActivityRegistrationLinkSummary>>

export async function fetchLinkedRoundSummaries(
  roundIds: string[],
): Promise<ActivityRegistrationLinkSummaries> {
  const ids = [...new Set(roundIds)]
  if (!ids.length) return {}
  const { data, error } = await createAdminClient()
    .from("match_rounds")
    .select("id, round_name, deleted_at")
    .in("id", ids)
  if (error) {
    console.error("[large-activity-registration-links] round summaries", error)
    return {}
  }
  return Object.fromEntries(data.map((round) => [
    round.id,
    { id: round.id, title: round.deleted_at ? `${round.round_name}（已删除）` : round.round_name, archived: !!round.deleted_at },
  ]))
}

// null means the associations could not be loaded. An empty object means there are no links.
export async function fetchLinkedLargeActivitySummaries(
  roundIds: string[],
): Promise<ActivityRegistrationLinkSummaries | null> {
  if (!roundIds.length) return {}
  const { data, error } = await createAdminClient()
    .from("past_event_reviews")
    .select("id, title, registration_round_id, archived_at")
    .in("registration_round_id", roundIds)
  if (error) {
    if (error.code !== "42703" && error.code !== "PGRST204") {
      console.error("[large-activity-registration-links] activity summaries", error)
    }
    return null
  }
  const links: ActivityRegistrationLinkSummaries = {}
  for (const activity of data) {
    if (!activity.registration_round_id) continue
    links[activity.registration_round_id] = {
      id: activity.id,
      title: activity.archived_at ? `${activity.title}（已归档）` : activity.title,
      archived: !!activity.archived_at,
    }
  }
  return links
}
