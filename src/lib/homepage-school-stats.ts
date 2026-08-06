export const MAX_FEATURED_SCHOOLS = 7
export const HOMEPAGE_SCHOOL_COLORS = [
  "#7fa862", "#79b9c4", "#e4b95f", "#719fd0", "#bd98ca", "#e58c7c", "#9dbb73",
] as const
export const HOMEPAGE_OTHER_SCHOOL_COLOR = "#b5b99f"

const MAX_INTEGER = 2_147_483_647
const SCHOOL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/

export interface HomepageFeaturedSchool {
  id: string
  zh: string
  ja: string
  count: number
}

export interface HomepageSchoolStatsDraft {
  totalMembers: number
  totalSchools: number
  featuredSchools: HomepageFeaturedSchool[]
}

export interface HomepageSchoolStats extends HomepageSchoolStatsDraft {
  version: number
  publishedAt: string | null
}

export interface HomepageSchoolStatsHistoryItem extends HomepageSchoolStats {
  id: number
  action: "seed" | "publish" | "restore"
  restoredFromVersion: number | null
  publishedByName: string
}

export interface HomepageSchoolChartItem extends HomepageFeaturedSchool {
  color: string
  isOther: boolean
}

export const FALLBACK_HOMEPAGE_SCHOOL_STATS: HomepageSchoolStats = {
  totalMembers: 135,
  totalSchools: 29,
  featuredSchools: [
    { id: "waseda", zh: "早稻田", ja: "早稲田", count: 44 },
    { id: "todai", zh: "东大", ja: "東大", count: 17 },
    { id: "tus", zh: "东理", ja: "理科大", count: 16 },
    { id: "hosei", zh: "法政", ja: "法政", count: 14 },
    { id: "tokyotech", zh: "东工", ja: "東工", count: 9 },
    { id: "sophia", zh: "上智", ja: "上智", count: 6 },
    { id: "keio", zh: "庆应", ja: "慶應", count: 6 },
  ],
  version: 1,
  publishedAt: null,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= MAX_INTEGER
}

function exactSchoolKeys(value: Record<string, unknown>) {
  return Object.keys(value).sort().join(",") === "count,id,ja,zh"
}

export function validateHomepageSchoolStatsDraft(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(value)) return { valid: false, errors: ["统计数据格式无效"] }
  const totalMembers = value.totalMembers
  const totalSchools = value.totalSchools
  const schools = value.featuredSchools
  if (!isInteger(totalMembers)) errors.push("社员总数必须是非负整数")
  if (!isInteger(totalSchools)) errors.push("学校总数必须是非负整数")
  if (!Array.isArray(schools)) return { valid: false, errors: [...errors, "精选学校必须是数组"] }
  if (schools.length > MAX_FEATURED_SCHOOLS) errors.push(`精选学校最多 ${MAX_FEATURED_SCHOOLS} 所`)
  if (isInteger(totalSchools) && totalSchools < schools.length) errors.push("学校总数不能少于精选学校数量")
  if (isInteger(totalMembers) && isInteger(totalSchools) && totalSchools > totalMembers) errors.push("学校总数不能超过社员总数")

  const ids = new Set<string>(), zhNames = new Set<string>(), jaNames = new Set<string>()
  let featuredTotal = 0
  schools.forEach((school, index) => {
    if (!isRecord(school) || !exactSchoolKeys(school)) {
      errors.push(`第 ${index + 1} 所学校格式无效`)
      return
    }
    const { id, zh, ja, count } = school
    if (typeof id !== "string" || !SCHOOL_ID.test(id) || id.toLowerCase() === "other") errors.push(`第 ${index + 1} 所学校 ID 无效`)
    if (typeof zh !== "string" || zh !== zh.trim() || zh.length < 1 || zh.length > 40 || ["其他", "其它"].includes(zh)) errors.push(`第 ${index + 1} 所学校中文名无效`)
    if (typeof ja !== "string" || ja !== ja.trim() || ja.length < 1 || ja.length > 40 || ja === "その他") errors.push(`第 ${index + 1} 所学校日文名无效`)
    if (!isInteger(count)) errors.push(`第 ${index + 1} 所学校人数必须是非负整数`)
    else featuredTotal += count
    if (typeof id === "string" && ids.has(id)) errors.push("精选学校 ID 不能重复")
    if (typeof zh === "string" && zhNames.has(zh.toLowerCase())) errors.push("精选学校中文名不能重复")
    if (typeof ja === "string" && jaNames.has(ja.toLowerCase())) errors.push("精选学校日文名不能重复")
    if (typeof id === "string") ids.add(id)
    if (typeof zh === "string") zhNames.add(zh.toLowerCase())
    if (typeof ja === "string") jaNames.add(ja.toLowerCase())
  })
  if (isInteger(totalMembers) && featuredTotal > totalMembers) errors.push("精选学校人数合计不能超过社员总数")
  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}

export function parseHomepageSchoolStats(row: unknown): HomepageSchoolStats | null {
  if (!isRecord(row)) return null
  const draft = { totalMembers: row.total_members, totalSchools: row.total_schools, featuredSchools: row.featured_schools }
  const version = row.version
  if (!validateHomepageSchoolStatsDraft(draft).valid || typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) return null
  if (typeof row.published_at !== "string" || !Number.isFinite(Date.parse(row.published_at))) return null
  return { ...(draft as HomepageSchoolStatsDraft), version, publishedAt: row.published_at }
}

export function getOtherCount(stats: HomepageSchoolStatsDraft): number {
  if (!isInteger(stats.totalMembers) || !Array.isArray(stats.featuredSchools)) return 0
  const featured = stats.featuredSchools.reduce((sum, school) => sum + (isInteger(school.count) ? school.count : 0), 0)
  return Math.max(0, stats.totalMembers - featured)
}

export function getHomepageSchoolChartItems(stats: HomepageSchoolStatsDraft): HomepageSchoolChartItem[] {
  const featured = stats.featuredSchools.slice(0, MAX_FEATURED_SCHOOLS).map((school, index) => ({
    ...school, color: HOMEPAGE_SCHOOL_COLORS[index], isOther: false,
  }))
  return [...featured, { id: "other", zh: "其他", ja: "その他", count: getOtherCount(stats), color: HOMEPAGE_OTHER_SCHOOL_COLOR, isOther: true }]
}
