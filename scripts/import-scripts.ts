/**
 * 导入 PDF 剧本/策划案到 Supabase
 *
 * 使用方法:
 *   npx tsx scripts/import-scripts.ts
 *
 * 需要环境变量:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

// 手动读 .env.local
const envPath = path.resolve(__dirname, "../.env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq > 0) {
      const key = trimmed.slice(0, eq)
      const val = trimmed.slice(eq + 1)
      if (!process.env[key]) process.env[key] = val
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://wjjhprflldvclulistcx.supabase.co"
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PDF_DIR = "D:\\OneDrive\\7_竹溪社\\2025策划案"

if (!SERVICE_KEY) {
  console.error("缺少 SUPABASE_SERVICE_ROLE_KEY 环境变量")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** 从文件名提取标题（去掉扩展名和常见后缀） */
function extractTitle(filename: string): string {
  return filename
    .replace(/\.pdf$/gi, "")  // 去掉 .pdf（可能有 .pdf.pdf）
    .replace(/\.pdf$/gi, "")  // 二次清理
    .replace(/\s*[\(（]\d+\)/, "")  // 去掉 (2) 之类
    .replace(/\s*(美工版|美工|正本|改)/, "")  // 去掉后缀
    .trim()
}

/** 推断类型 */
function inferType(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes("侦探") || lower.includes("推理")) return "推理游戏"
  if (lower.includes("射击") || lower.includes("飞镖") || lower.includes("cs")) return "游戏竞技"
  if (lower.includes("ktv") || lower.includes("美美") || lower.includes("邂逅")) return "联谊社交"
  if (lower.includes("vlog") || lower.includes("山手")) return "城市探索"
  return "城市探索"
}

async function main() {
  // 1. 扫描 PDF 文件
  const files = fs.readdirSync(PDF_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"))
  console.log(`找到 ${files.length} 个 PDF 文件`)

  let successCount = 0
  let errorCount = 0

  for (const filename of files) {
    const title = extractTitle(filename)
    const scriptType = inferType(title)
    const filepath = path.join(PDF_DIR, filename)
    const fileBuffer = fs.readFileSync(filepath)
    const storagePath = `pdfs/${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`

    console.log(`\n处理: ${filename}`)
    console.log(`  标题: ${title}`)
    console.log(`  类型: ${scriptType}`)

    // 2. 上传 PDF 到 Storage
    const { error: uploadErr } = await supabase.storage
      .from("scripts")
      .upload(storagePath, fileBuffer, {
        contentType: "application/pdf",
        upsert: false,
      })

    if (uploadErr) {
      console.error(`  ❌ 上传失败: ${uploadErr.message}`)
      errorCount++
      continue
    }

    // 3. 获取公开 URL
    const { data: urlData } = supabase.storage.from("scripts").getPublicUrl(storagePath)
    const pdfUrl = urlData.publicUrl

    // 4. 插入 scripts 表
    const { error: insertErr } = await supabase.from("scripts").insert({
      title,
      script_type: scriptType,
      pdf_url: pdfUrl,
      is_published: true,
      difficulty: "beginner",
      player_count_min: 2,
      player_count_max: 6,
      duration_minutes: 240,
    })

    if (insertErr) {
      console.error(`  ❌ 数据库写入失败: ${insertErr.message}`)
      errorCount++
      continue
    }

    console.log(`  ✅ 成功导入`)
    successCount++
  }

  console.log(`\n=== 导入完成 ===`)
  console.log(`成功: ${successCount}`)
  console.log(`失败: ${errorCount}`)
  console.log(`总计: ${files.length}`)
}

main().catch(console.error)
