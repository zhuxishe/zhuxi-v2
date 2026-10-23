type RequestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requestKey(roundId: string) {
  return `zhuxishe:admin:matching-request:${roundId}`
}

/** Keep only the operation identity in this tab; never persist the audit reason. */
export function matchingRequestId(roundId: string, storage: RequestStorage | null, generate: () => string): string {
  try {
    const existing = storage?.getItem(requestKey(roundId))
    if (existing && UUID.test(existing)) return existing
  } catch { /* The in-memory ref still protects retries when storage is unavailable. */ }
  const id = generate()
  try { storage?.setItem(requestKey(roundId), id) } catch { /* Storage can be disabled. */ }
  return id
}

export function clearMatchingRequestId(roundId: string, storage: RequestStorage | null, expectedId: string) {
  try {
    if (storage?.getItem(requestKey(roundId)) === expectedId) storage.removeItem(requestKey(roundId))
  } catch { /* Completion must not depend on browser storage. */ }
}
