const DEFAULT_PLAYER_PATH = "/app"
const PARSE_ORIGIN = "https://player.invalid"

// Proxy overwrites these values; callers must never use an incoming header as an auth decision.
export const PLAYER_RETURN_PATH_HEADER = "x-player-return-path"
export const PLAYER_HAD_SESSION_HEADER = "x-player-had-session"

function hasUnsafeCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return character === "\\" || code < 32 || code === 127
  })
}

function isPlayerPath(pathname: string) {
  return pathname === DEFAULT_PLAYER_PATH || pathname.startsWith("/app/")
}

/** Keep post-login navigation inside the Player App, including its query/hash. */
export function getSafePlayerNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || hasUnsafeCharacters(next)) {
    return DEFAULT_PLAYER_PATH
  }

  try {
    if (hasUnsafeCharacters(decodeURIComponent(next))) return DEFAULT_PLAYER_PATH

    const rawPath = next.split(/[?#]/, 1)[0]
    const decodedPath = decodeURIComponent(rawPath)

    // Reject ambiguous encoded delimiters and traversal before URL normalizes them.
    if (
      /%2f/i.test(rawPath)
      || /[%?#]/.test(decodedPath)
      || decodedPath.split("/").some((part) => part === "." || part === "..")
      || !isPlayerPath(decodedPath)
    ) {
      return DEFAULT_PLAYER_PATH
    }

    const destination = new URL(next, PARSE_ORIGIN)
    if (destination.origin !== PARSE_ORIGIN || !isPlayerPath(destination.pathname)) {
      return DEFAULT_PLAYER_PATH
    }

    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return DEFAULT_PLAYER_PATH
  }
}

export function buildPlayerLoginPath(
  next: string | null | undefined,
  options: { sessionExpired?: boolean; oauthFailed?: boolean } = {},
) {
  const params = new URLSearchParams({ next: getSafePlayerNextPath(next) })
  if (options.sessionExpired) params.set("reason", "session_expired")
  if (options.oauthFailed) params.set("error", "oauth_failed")
  return `/login?${params.toString()}`
}
