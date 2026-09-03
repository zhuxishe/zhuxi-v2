import { createHash } from "node:crypto"

export const LEGACY_COVER_RECONCILIATION_SCRIPT_ID = "069c13d2-e574-4f72-9902-7a30ac886f24"
export const SCRIPT_COVER_BUCKET = "scripts-covers"
export const MAX_SCRIPT_COVER_BYTES = 5 * 1024 * 1024
export const MAX_LEGACY_COVER_SOURCE_BYTES = 12 * 1024 * 1024

export interface LegacyScriptCoverCandidate {
  id: string
  title: string
  expectedCoverUrl: string | null
  sourcePath: string
  updatedAt: string
}

const PUBLIC_SCRIPTS_MARKER = "/storage/v1/object/public/scripts/"
const STATIC_ALLOWED_HOSTS = new Set([
  "wjjhprflldvclulistcx.supabase.co",
  "api.zhuxishe.com",
])

export function legacyScriptCoverSourcePath(url: string, scriptId: string) {
  try {
    const parsed = new URL(url)
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || !legacyHostIsAllowed(parsed.hostname)
      || !parsed.pathname.startsWith(PUBLIC_SCRIPTS_MARKER)
    ) return null
    const encodedPath = parsed.pathname.slice(PUBLIC_SCRIPTS_MARKER.length)
    if (/%2f|%5c/i.test(encodedPath)) return null
    const sourcePath = decodeURIComponent(encodedPath)
    return legacyProtectedPagePathIsValid(sourcePath, scriptId) ? sourcePath : null
  } catch {
    return null
  }
}

export function legacyProtectedPagePathIsValid(path: string, scriptId: string) {
  const escapedId = scriptId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`^pages/${escapedId}/page_001\\.(?:jpg|png|webp)$`, "i").test(path)
}

export function legacyCoverDestinationPath(
  candidate: LegacyScriptCoverCandidate,
  extension: "jpg" | "png" | "webp",
) {
  const bytes = Buffer.from(createHash("sha256")
    .update(`content-v2-cover:${candidate.id}:${candidate.sourcePath}:${extension}`)
    .digest()
    .subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  return `covers/${candidate.id}/${id}.${extension}`
}

export function isPotentialLegacyScriptCoverUrl(value: string) {
  return value.includes(PUBLIC_SCRIPTS_MARKER)
}

function legacyHostIsAllowed(hostname: string) {
  const hosts = new Set(STATIC_ALLOWED_HOSTS)
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      hosts.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.toLowerCase())
    }
  } catch {
    return false
  }
  return hosts.has(hostname.toLowerCase())
}
