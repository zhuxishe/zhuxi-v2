/**
 * Pure routing logic for player home page.
 * Extracted for testability — no Next.js / Supabase dependencies.
 */

export interface PlayerRouteInput {
  /** null = no member record */
  status: string | null
  accountStatus: string | null
  profileStage: string | null
  onboardingStep: number
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
  // No member record → fill interview form. In normal /app traffic the
  // idempotent ensure RPC creates this record before routing.
  if (!player || player.status === null) {
    return { action: "redirect", to: "/app/interview-form" }
  }

  // Account lifecycle always wins over application/profile state.
  if (
    player.accountStatus !== "active" ||
    player.status === "inactive"
  ) {
    return { action: "redirect", to: "/app/inactive" }
  }

  const draftProfile =
    player.profileStage === "not_started" ||
    player.profileStage === "in_progress"

  // A draft is resumable even after step 1 has created member_identity.
  if (draftProfile || player.onboardingStep < 4 || !player.hasIdentity) {
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

  if (player.status === "approved") {
    return { action: "render", view: "home" }
  }

  // Unknown lifecycle values must not silently gain normal Player access.
  return { action: "redirect", to: "/app/inactive" }
}
