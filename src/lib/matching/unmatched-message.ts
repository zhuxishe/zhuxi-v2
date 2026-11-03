/** Optional player-facing copy, kept separate from internal audit and diagnostic text. */
export function normalizeUnmatchedMessage(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== "string") throw new Error("工作人员留言须为文字")
  const message = value.trim()
  if (Array.from(message).length > 300) throw new Error("工作人员留言最多300字")
  return message || null
}

/** Missing entry inherits the common message; explicit null suppresses it. */
export function normalizeUnmatchedMemberMessages(value: unknown, allowedMemberIds?: readonly string[]): Record<string, string | null> {
  if (value === undefined) return {}
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("个人留言格式无效，请重新核对")
  const entries = Object.entries(value)
  if (entries.length > 10000) throw new Error("个人留言人数超出本批处理范围")
  const allowed = allowedMemberIds ? new Set(allowedMemberIds) : null
  const messages: Record<string, string | null> = {}
  for (const [id, message] of entries) {
    if (!id || id.length > 200 || ["__proto__", "prototype", "constructor"].includes(id)) throw new Error("个人留言的玩家标识无效")
    if (allowed && !allowed.has(id)) throw new Error("个人留言包含本批次以外的玩家，请刷新后核对")
    if (message === null) messages[id] = null
    else {
      const normalized = normalizeUnmatchedMessage(message)
      if (normalized) messages[id] = normalized
    }
  }
  return messages
}

/** Server callers validate first; the editor also previews incomplete text. */
export function resolveUnmatchedMessage(common: string | null | undefined, memberMessages: Readonly<Record<string, string | null>> | undefined, memberId: string): string | null {
  if (memberMessages && Object.hasOwn(memberMessages, memberId)) {
    const message = memberMessages[memberId]
    if (message === null) return null
    if (typeof message === "string" && message.trim()) return message.trim()
  }
  return typeof common === "string" && common.trim() ? common.trim() : null
}
