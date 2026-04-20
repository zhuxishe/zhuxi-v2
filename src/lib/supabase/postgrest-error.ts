interface PostgrestLikeError {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

function asPostgrestError(error: unknown): PostgrestLikeError | null {
  if (!error || typeof error !== "object" || Array.isArray(error)) return null
  return error as PostgrestLikeError
}

export function isMissingColumnError(error: unknown, columnName?: string): boolean {
  const candidate = asPostgrestError(error)
  if (!candidate || candidate.code !== "42703") return false
  if (!columnName) return true
  return candidate.message?.includes(columnName) ?? false
}

export function getPostgrestErrorMessage(error: unknown, fallback = "操作失败"): string {
  if (error instanceof Error && error.message) return error.message

  const candidate = asPostgrestError(error)
  if (!candidate?.message) return fallback

  return [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => Boolean(value))
    .join(" | ")
}
