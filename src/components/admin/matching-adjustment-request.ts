type RequestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> & Partial<Pick<Storage, "key" | "length">>
export type AdjustmentRequestKind = "manual" | "pool" | "split" | "restore"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const pendingInMemory = new Map<string, string>()

function requestPrefix(sessionId: string) {
  return `zhuxishe:admin:matching-adjustment:${sessionId}:`
}
function requestKey(sessionId: string, kind: AdjustmentRequestKind, targets: string[]) {
  return `${requestPrefix(sessionId)}${kind}:${[...new Set(targets)].sort().join(",")}`
}

/** Persist only operation and target IDs in this tab, never answers or the audit reason. */
export function matchingAdjustmentRequestId(sessionId: string, kind: AdjustmentRequestKind, targets: string[], storage: RequestStorage | null, generate: () => string): string {
  const key = requestKey(sessionId, kind, targets)
  try {
    const existing = storage?.getItem(key)
    if (existing && UUID.test(existing)) {
      pendingInMemory.set(key, existing)
      return existing
    }
  } catch { /* The in-memory identity covers unavailable storage. */ }
  const id = pendingInMemory.get(key) ?? generate()
  pendingInMemory.set(key, id)
  try { storage?.setItem(key, id) } catch { /* Storage can be disabled. */ }
  return id
}

export function clearMatchingAdjustmentRequestId(sessionId: string, kind: AdjustmentRequestKind, targets: string[], storage: RequestStorage | null, expectedId: string) {
  const key = requestKey(sessionId, kind, targets)
  if (pendingInMemory.get(key) === expectedId) pendingInMemory.delete(key)
  try {
    if (storage?.getItem(key) === expectedId) storage.removeItem(key)
  } catch { /* Acknowledged completion must not depend on browser storage. */ }
}

/** A recovered success can acknowledge a request left by a previous page load. */
function clearRequestsById(sessionId: string, completedIds: string[], storage: RequestStorage | null) {
  const complete = new Set(completedIds)
  const prefix = requestPrefix(sessionId)
  for (const [key, id] of pendingInMemory) if (key.startsWith(prefix) && complete.has(id)) pendingInMemory.delete(key)
  try {
    const keys: string[] = []
    for (let index = 0; index < (storage?.length ?? 0); index += 1) {
      const key = storage?.key?.(index)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    for (const key of keys) if (complete.has(storage!.getItem(key) ?? "")) storage!.removeItem(key)
  } catch { /* Completion must not depend on browser storage. */ }
}

export function adjustmentRequestStorage(): RequestStorage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage } catch { return null }
}

/** Acknowledge succeeded operations returned by the server. */
export function clearCompletedMatchingAdjustmentRequests(sessionId: string, completedIds: string[], storage: RequestStorage | null) {
  clearRequestsById(sessionId, completedIds, storage)
}

/** Only an explicit new-operation choice may release a terminal failed request. */
export function releaseFailedMatchingAdjustmentRequest(sessionId: string, record: { id: string; status: string; can_recover: boolean }, storage: RequestStorage | null): boolean {
  if (record.status !== "failed" || record.can_recover) return false
  clearRequestsById(sessionId, [record.id], storage)
  return true
}
