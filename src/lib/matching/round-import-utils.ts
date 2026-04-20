export function normalizeImportName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u3000\s]+/g, "")
    .trim()
}

export function normalizeGameTypeChoice(value: string | null | undefined): "双人" | "多人" | "都可以" | null {
  const text = (value ?? "").trim()
  if (!text) return null
  if (text.includes("双人")) return "双人"
  if (text.includes("多人")) return "多人"
  if (text.includes("都可以")) return "都可以"
  return null
}

export function normalizeGenderPref(value: string | null | undefined): "男" | "女" | "都可以" | null {
  const text = (value ?? "").trim()
  if (!text) return null
  if (text === "男生" || text === "男") return "男"
  if (text === "女生" || text === "女") return "女"
  if (text.includes("都可以")) return "都可以"
  return null
}

export function normalizeLegacyGender(value: string | null | undefined): "male" | "female" | "other" {
  const text = (value ?? "").trim()
  if (text === "男" || text === "male") return "male"
  if (text === "女" || text === "female") return "female"
  return "other"
}

export function isManualSelfGender(value: unknown): value is "male" | "female" | "other" {
  return value === "male" || value === "female" || value === "other"
}

export function isCheckedCell(value: unknown): boolean {
  if (value === true || value === 1) return true
  const text = String(value ?? "").trim().toLowerCase()
  if (!text) return false
  return !["false", "0", "否", "no", "n/a"].includes(text)
}

export function mergeMatchHistory(
  primary: { name: string; count: number }[],
  extra: { name: string; count: number }[],
): { name: string; count: number }[] {
  const merged = new Map<string, number>()
  for (const item of [...primary, ...extra]) {
    merged.set(item.name, (merged.get(item.name) ?? 0) + item.count)
  }
  return Array.from(merged, ([name, count]) => ({ name, count }))
}
