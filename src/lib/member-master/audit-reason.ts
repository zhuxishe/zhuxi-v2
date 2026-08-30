export type AuditReasonResult =
  | { ok: true; reason: string }
  | { ok: false; error: string }

/**
 * Keep the browser and server contract aligned with the database guard.
 * PostgreSQL char_length counts Unicode code points, so use Array.from here
 * rather than UTF-16 string length.
 */
export function normalizeAdminAuditReason(rawReason: string): AuditReasonResult {
  const reason = rawReason.trim()
  const length = Array.from(reason).length

  if (length < 4 || length > 500) {
    return { ok: false, error: "操作理由需为 4–500 个字符" }
  }

  return { ok: true, reason }
}

export function adminAuditReasonIsValid(rawReason: string): boolean {
  return normalizeAdminAuditReason(rawReason).ok
}
