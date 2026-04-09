import { createClient } from "@/lib/supabase/server"
import type { MemberWithIdentity, MemberDetail } from "@/types"

const MEMBER_PAGE_SIZE = 50

export async function fetchMembers(options?: {
  status?: string
  search?: string
  page?: number
}): Promise<{ members: MemberWithIdentity[]; total: number }> {
  const supabase = await createClient()

  let query = supabase
    .from("members")
    .select(`
      id, member_number, status, interview_date, interviewer,
      attractiveness_score, created_at,
      member_identity (
        full_name, nickname, gender, age_range,
        nationality, current_city, school_name, department
      )
    `)
    .order("created_at", { ascending: false })
    .limit(500)

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status)
  }

  const { data, error } = await query

  if (error) throw error

  // Supabase 复杂 join 的推导类型与自定义接口不完全兼容，双重 cast 是已知限制
  let members = (data ?? []) as unknown as MemberWithIdentity[]

  // 搜索过滤（姓名/昵称/学校/编号）
  if (options?.search) {
    const q = options.search.toLowerCase()
    members = members.filter((m) => {
      const identity = m.member_identity
      if (!identity) return false
      return (
        identity.full_name.toLowerCase().includes(q) ||
        identity.nickname?.toLowerCase().includes(q) ||
        identity.school_name?.toLowerCase().includes(q) ||
        m.member_number?.toLowerCase().includes(q)
      )
    })
  }

  const total = members.length
  const page = options?.page ?? 1
  const paginated = members.slice((page - 1) * MEMBER_PAGE_SIZE, page * MEMBER_PAGE_SIZE)

  return { members: paginated, total }
}

export async function fetchMemberBriefList() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("members")
    .select("id, member_identity(full_name)")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
  return (data ?? []).map((m) => {
    const identity = Array.isArray(m.member_identity)
      ? m.member_identity[0]
      : m.member_identity
    return {
      id: m.id,
      name: (identity as { full_name?: string })?.full_name ?? m.id,
    }
  })
}

export async function fetchMemberDetail(id: string): Promise<MemberDetail> {
  const supabase = await createClient()

  const { data: member, error } = await supabase
    .from("members")
    .select(`
      *,
      member_identity (*),
      interview_evaluations (*),
      member_language (*),
      member_interests (*),
      member_personality (*),
      member_boundaries (*),
      member_verification (*)
    `)
    .eq("id", id)
    .single()

  if (error) throw error
  // Supabase 复杂 join 推导类型与 MemberDetail 不完全兼容，双重 cast 是已知限制
  return member as unknown as MemberDetail
}
