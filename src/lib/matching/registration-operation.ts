/** Stable action errors; database details never need to reach the player. */
export function registrationOperationError(error: { message?: string; code?: string } | null) {
  if (error?.message?.includes("REGISTRATION_STATE_CHANGED") || error?.code === "23505") return "registrationChanged"
  if (error?.message?.includes("REGISTRATION_CANCEL_UNAVAILABLE")) return "registrationCancelUnavailable"
  if (error?.message?.includes("REGISTRATION_NOT_FOUND")) return "registrationNotFound"
  if (error?.message?.includes("ROUND_CONFIG_CHANGED")) return "surveyUpdated"
  return null
}
