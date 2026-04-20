export function displayGender(g: string | null | undefined): string {
  if (g === "male") return "男"
  if (g === "female") return "女"
  return g || "未知"
}

export function formatAvailabilityEntries(
  availability?: Record<string, string[]>,
): string[] {
  if (!availability) return []
  return Object.entries(availability)
    .filter(([, slots]) => slots.length > 0)
    .map(([date, slots]) => `${date.replace(/^\d{4}-/, "")} ${slots.join("、")}`)
}
