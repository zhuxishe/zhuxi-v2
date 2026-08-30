import { NextRequest, NextResponse } from "next/server"
import { getAdmin } from "@/lib/auth/admin"
import { buildSessionExportWorkbook } from "@/lib/matching/session-export"

interface Props {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: Props) {
  const admin = await getAdmin()
  if (!admin) {
    return NextResponse.redirect(new URL("/admin/login", request.url))
  }
  if (admin.role !== "super_admin") {
    return NextResponse.json({ error: "仅超级管理员可导出原始匹配数据" }, { status: 403 })
  }

  try {
    const { id } = await params
    const { buffer, fileName } = await buildSessionExportWorkbook(id)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    })
  } catch (error) {
    console.error("[matching export]", error)
    const message = error instanceof Error && /[\u3400-\u9fff]/.test(error.message)
      ? error.message
      : "导出失败，请稍后重试"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
