export function normalizeMemberNumber(value: string): string | null {
  const normalized = value.trim().toUpperCase()
  // This is input normalization only. The database permits these numbers only
  // for identities registered in the protected test-account registry.
  if (/^TST_\d{3}$/.test(normalized)) {
    const number = Number(normalized.slice(4))
    return number >= 1 && number <= 27 ? normalized : null
  }
  if (!/^ZXS_\d{3,}$/.test(normalized) || normalized.length > 64) return null
  const digits = normalized.slice(4).replace(/^0+(?=\d)/, "")
  if (digits.length > 18) return null
  return `ZXS_${digits.padStart(3, "0")}`
}
