export function normalizeMemberNumber(value: string): string | null {
  const normalized = value.trim().toUpperCase()
  if (!/^ZXS_\d{3,}$/.test(normalized) || normalized.length > 64) return null
  const digits = normalized.slice(4).replace(/^0+(?=\d)/, "")
  if (digits.length > 18) return null
  return `ZXS_${digits.padStart(3, "0")}`
}
