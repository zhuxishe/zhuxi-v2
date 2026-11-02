export class MatchingReviewDownloadError extends Error {
  constructor(message: string, readonly stale = false) { super(message) }
}

/** Download only the reviewed saved version; never silently accept a newer result. */
export async function downloadMatchingReview(sessionId: string, revision: string, signature: string) {
  const query = new URLSearchParams({ revision, signature })
  const response = await fetch(`/admin/matching/${encodeURIComponent(sessionId)}/export?${query}`, { cache: "no-store" })
  if (!response.ok) {
    let message = "导出失败，请稍后重试。"
    try {
      const body: unknown = await response.json()
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error
    } catch { /* Keep a useful message for non-JSON gateway responses. */ }
    throw new MatchingReviewDownloadError(message, response.status === 409)
  }
  if (!response.headers.get("content-type")?.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
    throw new MatchingReviewDownloadError("未能取得Excel文件，请确认登录状态后重试。")
  }
  const blob = await response.blob()
  const disposition = response.headers.get("content-disposition") ?? ""
  const rawName = /filename="([^"]+)"/.exec(disposition)?.[1]
  let filename = "匹配结果.xlsx"
  try { if (rawName) filename = decodeURIComponent(rawName).replace(/[\\/]/g, "-") } catch {}
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement("a")
    link.href = url; link.download = filename
    document.body.appendChild(link); link.click(); link.remove()
  } finally { URL.revokeObjectURL(url) }
}
