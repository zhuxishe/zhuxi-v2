/**
 * PDF → WebP 图片转换 + 上传到 Supabase Storage
 *
 * 使用 pdftoppm (poppler) 将每页转为 JPEG，再用 sharp 转 WebP
 * 然后上传到 Supabase Storage，更新 scripts 表的 page_images
 *
 * 用法: npx tsx scripts/convert-pdf-to-images.ts
 *
 * 依赖: pdftoppm (系统级), sharp (npm)
 */

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"
import sharp from "sharp"

// 读 .env.local
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

const SUPABASE_URL = "https://wjjhprflldvclulistcx.supabase.co"
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PDF_DIR = "D:\\OneDrive\\7_竹溪社\\2025策划案"
const TEMP_DIR = path.resolve(__dirname, "../.tmp-pdf-pages")
const DPI = 150  // 150 DPI → 手机端足够清晰
const WEBP_QUALITY = 75

if (!SERVICE_KEY) {
  console.error("缺少 SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // 确保临时目录
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

  // 获取所有有 pdf_url 但没有 page_images 的脚本
  const { data: scripts, error } = await supabase
    .from("scripts")
    .select("id, title, pdf_url, page_count")
    .not("pdf_url", "is", null)
    .or("page_count.eq.0,page_count.is.null")
    .order("created_at")

  if (error) { console.error("查询失败:", error.message); process.exit(1) }
  if (!scripts || scripts.length === 0) { console.log("没有需要转换的剧本"); return }

  // 建立标题→本地文件映射
  const localFiles = fs.readdirSync(PDF_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"))
  const titleToFile = new Map<string, string>()
  for (const file of localFiles) {
    // 提取关键词用于模糊匹配
    const clean = file.replace(/\.pdf$/gi, "").replace(/\.pdf$/gi, "")
    titleToFile.set(clean, file)
  }

  console.log(`找到 ${scripts.length} 个需要转换的剧本\n`)

  let success = 0
  let failed = 0

  for (const script of scripts) {
    console.log(`[${script.title}]`)

    try {
      // 1. 从本地找 PDF 文件（模糊匹配标题）
      let pdfPath = ""
      for (const [clean, file] of titleToFile) {
        if (clean.includes(script.title) || script.title.includes(clean.slice(0, 4))) {
          pdfPath = path.join(PDF_DIR, file)
          break
        }
      }
      // 精确匹配尝试
      if (!pdfPath) {
        for (const file of localFiles) {
          if (file.includes(script.title.slice(0, 4))) {
            pdfPath = path.join(PDF_DIR, file)
            break
          }
        }
      }
      if (!pdfPath || !fs.existsSync(pdfPath)) {
        throw new Error(`找不到本地 PDF 文件: ${script.title}`)
      }
      console.log(`  本地文件: ${path.basename(pdfPath)}`)

      // 2. pdftoppm 转 PNG
      const prefix = path.join(TEMP_DIR, script.id)
      console.log("  转换页面...")
      execSync(`pdftoppm -png -r ${DPI} "${pdfPath}" "${prefix}"`, {
        timeout: 120000,
        stdio: "pipe",
      })

      // 3. 收集生成的 PNG 文件
      const jpegFiles = fs.readdirSync(TEMP_DIR)
        .filter((f) => f.startsWith(script.id) && f.endsWith(".png"))
        .sort()

      if (jpegFiles.length === 0) throw new Error("pdftoppm 未生成任何图片")

      console.log(`  ${jpegFiles.length} 页`)

      // 4. 转 WebP + 上传
      const pageUrls: string[] = []
      for (let i = 0; i < jpegFiles.length; i++) {
        const jpegPath = path.join(TEMP_DIR, jpegFiles[i])
        const webpBuffer = await sharp(jpegPath)
          .webp({ quality: WEBP_QUALITY })
          .toBuffer()

        const storagePath = `pages/${script.id}/page_${String(i + 1).padStart(3, "0")}.webp`
        const { error: upErr } = await supabase.storage
          .from("scripts")
          .upload(storagePath, webpBuffer, {
            contentType: "image/webp",
            upsert: true,
          })

        if (upErr) throw new Error(`上传第${i + 1}页失败: ${upErr.message}`)

        const { data: urlData } = supabase.storage.from("scripts").getPublicUrl(storagePath)
        pageUrls.push(urlData.publicUrl)

        // 删除临时 JPEG
        fs.unlinkSync(jpegPath)
      }

      // 5. 更新数据库
      const { error: dbErr } = await supabase
        .from("scripts")
        .update({ page_images: pageUrls, page_count: pageUrls.length })
        .eq("id", script.id)

      if (dbErr) throw new Error(`数据库更新失败: ${dbErr.message}`)

      // 删除临时 PDF
      fs.unlinkSync(pdfPath)

      const totalKB = pageUrls.length > 0
        ? Math.round(pageUrls.length * 80) // 估算
        : 0
      console.log(`  ✅ ${pageUrls.length} 页，约 ${totalKB}KB 总计`)
      success++
    } catch (err) {
      console.error(`  ❌ ${(err as Error).message}`)
      failed++
    }
  }

  // 清理临时目录
  if (fs.existsSync(TEMP_DIR)) {
    const remaining = fs.readdirSync(TEMP_DIR)
    for (const f of remaining) fs.unlinkSync(path.join(TEMP_DIR, f))
    fs.rmdirSync(TEMP_DIR)
  }

  console.log(`\n=== 转换完成 ===`)
  console.log(`成功: ${success}`)
  console.log(`失败: ${failed}`)
}

main().catch(console.error)
