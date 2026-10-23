type RequestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requestKey(roundId: string) {
  return `zhuxishe:admin:round-import-request:${roundId}`
}

/** Store only an operation UUID. Workbook contents, selections, and reasons stay in memory. */
export function readRoundImportRequestId(roundId: string, storage: RequestStorage | null): string | null {
  try {
    const value = storage?.getItem(requestKey(roundId))
    return value && UUID.test(value) ? value : null
  } catch { return null }
}

export function roundImportRequestId(roundId: string, storage: RequestStorage | null, generate: () => string): string {
  const existing = readRoundImportRequestId(roundId, storage)
  if (existing) return existing
  const id = generate()
  try { storage?.setItem(requestKey(roundId), id) } catch { /* The caller retains the ID in memory. */ }
  return id
}

export function clearRoundImportRequestId(roundId: string, storage: RequestStorage | null, expectedId: string) {
  try {
    if (storage?.getItem(requestKey(roundId)) === expectedId) storage.removeItem(requestKey(roundId))
  } catch { /* A completed import must not depend on browser storage. */ }
}
