export class MatchingBoardCsvDownloadError extends Error {
  constructor(message: string, readonly stale = false) { super(message) }
}

/** A template is always tied to the currently reviewed saved board. */
export async function downloadMatchingBoardCsv(sessionId: string, revision: string, signature: string) {
  const query = new URLSearchParams({ revision, signature })
  const response = await fetch(`/admin/matching/${encodeURIComponent(sessionId)}/adjustment-template?${query}`, { cache: "no-store" })
  if (!response.ok) {
    let message = "下载调整模板失败，请稍后重试。"
    try {
      const body: unknown = await response.json()
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error
    } catch { /* Gateways can return non-JSON errors. */ }
    throw new MatchingBoardCsvDownloadError(message, response.status === 409)
  }
  if (!response.headers.get("content-type")?.toLowerCase().includes("text/csv")) {
    throw new MatchingBoardCsvDownloadError("未能取得CSV模板，请确认登录状态后重试。")
  }
  const blob = await response.blob()
  const disposition = response.headers.get("content-disposition") ?? ""
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] ?? /filename="([^"]+)"/i.exec(disposition)?.[1]
  let filename = "匹配人工调整.csv"
  try { if (encoded) filename = decodeURIComponent(encoded).replace(/[\\/\u0000-\u001f\u007f]/g, "-") } catch {}
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement("a")
    link.href = url; link.download = filename
    document.body.appendChild(link); link.click(); link.remove()
  } finally { URL.revokeObjectURL(url) }
}
