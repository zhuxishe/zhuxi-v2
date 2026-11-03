import { NextRequest, NextResponse } from "next/server"
import { getAdmin } from "@/lib/auth/admin"
import { buildMatchingBoardCsvTemplate, MatchingBoardCsvError } from "@/lib/matching/board-csv-service"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store" }
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: "请重新登录后台后下载调整模板。" }, { status: 401, headers })
  if (admin.role !== "super_admin") return NextResponse.json({ error: "仅超级管理员可下载人工调整模板。" }, { status: 403, headers })
  try {
    const { id } = await params
    const template = await buildMatchingBoardCsvTemplate(id, request.nextUrl.searchParams.get("revision") ?? "",
      request.nextUrl.searchParams.get("signature") ?? undefined)
    return new NextResponse(template.csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="matching-adjustment.csv"; filename*=UTF-8''${encodeURIComponent(template.fileName)}`,
      "X-Content-Type-Options": "nosniff" } })
  } catch (error) {
    const known = error instanceof MatchingBoardCsvError
    return NextResponse.json({ error: known ? error.message : "下载调整模板失败，请重新读取匹配详情后再试。" }, { status: known ? error.status : 400, headers })
  }
}
