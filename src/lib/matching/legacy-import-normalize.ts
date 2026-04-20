function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null
  const parsed = typeof value === "number" ? value : Number(String(value).trim())
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeLegacyCompatibilityScore(value: unknown): number | null {
  const parsed = toFiniteNumber(value)
  if (parsed == null) return null
  return Math.min(5, Math.max(0, Math.round(parsed)))
}

export function normalizeLegacySessionCount(value: unknown): number {
  const parsed = toFiniteNumber(value)
  if (parsed == null) return 0
  return Math.max(0, Math.round(parsed))
}
