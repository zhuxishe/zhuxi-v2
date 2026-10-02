import type { MemberDirectorySort, MemberSchoolOrder } from "@/types/member-center"

const SORTS: MemberDirectorySort[] = ["default", "updated_asc", "updated_desc", "number_asc", "number_desc"]
const SCHOOL_ORDERS: MemberSchoolOrder[] = ["default", "name_asc", "name_desc", "count_desc"]

export function normalizeMemberDirectoryControls(input: {
  school?: string | string[]
  sort?: string
  schoolOrder?: string
}, canViewHighRisk = true) {
  const schools = input.school === undefined ? [] : [input.school].flat()
  const sort = SORTS.find((value) => value === input.sort) ?? "default"
  return {
    schools: [...new Set(schools.map((value) => value.trim()))],
    sort: !canViewHighRisk && sort.startsWith("number_") ? "default" as const : sort,
    schoolOrder: SCHOOL_ORDERS.find((value) => value === input.schoolOrder) ?? "default",
  }
}

export function nextDirectorySort(current: MemberDirectorySort, column: "updated" | "number"): MemberDirectorySort {
  if (current === `${column}_asc`) return `${column}_desc`
  if (current === `${column}_desc`) return "default"
  return `${column}_asc`
}

export function directoryControlsUrl(current: string, changes: {
  schools?: string[]
  sort?: MemberDirectorySort
  schoolOrder?: MemberSchoolOrder
}) {
  const params = new URLSearchParams(current)
  if (changes.schools !== undefined) {
    params.delete("school")
    for (const school of changes.schools) params.append("school", school)
  }
  for (const key of ["sort", "schoolOrder"] as const) {
    const value = changes[key]
    if (value === "default") params.delete(key)
    else if (value !== undefined) params.set(key, value)
  }
  params.delete("page")
  const query = params.toString()
  return `/admin/members${query ? `?${query}` : ""}`
}
