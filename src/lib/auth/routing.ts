/**
 * Pure routing logic for player home page.
 * Extracted for testability — no Next.js / Supabase dependencies.
 */

export interface PlayerRouteInput {
  /** null = no member record */
  status: string | null
  hasIdentity: boolean
}

export type PlayerRouteResult =
  | { action: "redirect"; to: string }
  | { action: "render"; view: "pending" | "rejected" | "home" }

/**
 * Determine where a player should go based on their member status.
 * @param player null if no member record exists
 */
export function resolvePlayerRoute(
  player: PlayerRouteInput | null
): PlayerRouteResult {
  // No member record → fill interview form
  if (!player || player.status === null) {
    return { action: "redirect", to: "/app/interview-form" }
  }

  // Pending + no identity → fill interview form
  if (player.status === "pending" && !player.hasIdentity) {
    return { action: "redirect", to: "/app/interview-form" }
  }

  // Pending + identity filled → show waiting page
  if (player.status === "pending") {
    return { action: "render", view: "pending" }
  }

  // Rejected
  if (player.status === "rejected") {
    return { action: "render", view: "rejected" }
  }

  // Approved (or any other status) → normal home
  return { action: "render", view: "home" }
}
