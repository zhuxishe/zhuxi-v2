/** Optional player-facing copy, kept separate from internal audit and diagnostic text. */
export function normalizeUnmatchedMessage(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== "string") throw new Error("工作人员留言须为文字")
  const message = value.trim()
  if (Array.from(message).length > 300) throw new Error("工作人员留言最多300字")
  return message || null
}
