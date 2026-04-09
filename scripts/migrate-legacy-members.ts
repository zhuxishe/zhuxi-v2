/**
 * 将旧项目 members_clean.json (96人) 导入 V2 的 legacy_members 表
 *
 * 用法: npx tsx scripts/migrate-legacy-members.ts
 *
 * 需要环境变量:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { resolve } from "path"

const MEMBERS_JSON_PATH = resolve("I:/app/zhuxi/paper/matching-algorithm/data/members_clean.json")

interface OldMember {
  no: string
  name: string
  nickname: string | null
  gender: string | null
  school: string | null
  department: string | null
  interestTags: string[]
  socialTags: string[]
  gameMode: string | null
  compatibilityScore: number | null
  sessionCount: number | null
  matchHistory: { name: string; count: number }[]
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // 读取旧数据
  const raw = readFileSync(MEMBERS_JSON_PATH, "utf-8")
  const data = JSON.parse(raw) as { members: OldMember[] }
  console.log(`读取 ${data.members.length} 名旧成员`)

  // 检查已存在的记录
  const { data: existing } = await supabase
    .from("legacy_members")
    .select("member_no")

  const existingNos = new Set((existing ?? []).map((r) => r.member_no))

  const rows = data.members
    .filter((m) => !existingNos.has(m.no))
    .map((m) => ({
      member_no: m.no,
      full_name: m.name,
      gender: m.gender,
      school: m.school,
      department: m.department,
      interest_tags: m.interestTags ?? [],
      social_tags: m.socialTags ?? [],
      game_mode: m.gameMode,
      compatibility_score: m.compatibilityScore,
      session_count: m.sessionCount ?? 0,
      match_history: m.matchHistory ?? [],
    }))

  if (rows.length === 0) {
    console.log("所有成员已存在，无需导入")
    return
  }

  // 分批插入（每批 50 条）
  const batchSize = 50
  let inserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from("legacy_members").insert(batch)
    if (error) {
      console.error(`批次 ${i / batchSize + 1} 失败:`, error.message)
      process.exit(1)
    }
    inserted += batch.length
    console.log(`已插入 ${inserted}/${rows.length}`)
  }

  console.log(`\n完成! 共导入 ${inserted} 名旧成员`)
  if (existingNos.size > 0) {
    console.log(`跳过 ${existingNos.size} 名已存在的成员`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
