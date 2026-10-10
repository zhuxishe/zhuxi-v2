/** Passive observation for server clients only; never imported by client.ts. */
type Source = "server" | "admin" | "proxy" | "callback"
type Reason = "slow" | "http_error" | "network_error"
interface Timing { startedAt: number; monotonic: number }

const SLOW_MS = 2_000
const WINDOW_MS = 60_000
const FAILURE_BUDGET = 20
const SLOW_BUDGET = 5
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
const RPC_OPERATIONS = new Set([
  "ensure_my_member_record", "get_my_profile_summary", "save_my_onboarding_step",
  "submit_my_onboarding", "admin_update_member_section", "manage_my_registration",
  "player_list_round_peer_review_events", "player_get_round_peer_reviews",
  "player_submit_round_peer_feedback", "player_update_round_peer_report",
  "admin_list_round_peer_review_events", "admin_get_round_peer_reviews",
])
const AUTH_OPERATIONS: Record<string, string> = {
  "/auth/v1/user": "user", "/auth/v1/token": "token", "/auth/v1/signup": "signup",
  "/auth/v1/logout": "logout", "/auth/v1/verify": "verify", "/auth/v1/recover": "recover",
  "/auth/v1/resend": "resend", "/auth/v1/.well-known/jwks.json": "jwks",
}

// Constant-space, per-process/module budget, shared by all client factories.
let windowStartedAt = 0
let failures = 0
let slow = 0
let suppressedFailures = 0
let suppressedSlow = 0

function isEnabled() {
  try {
    const flag = process.env.SUPABASE_OBSERVABILITY_ENABLED
    return flag !== "0" && (flag === "1" || process.env.NODE_ENV === "production")
  } catch { return false }
}

function startTiming(): Timing | null {
  try {
    const startedAt = Date.now()
    const monotonic = performance.now()
    return Number.isFinite(startedAt) && Number.isFinite(monotonic)
      ? { startedAt, monotonic } : null
  } catch { return null }
}

function classify(input: Parameters<typeof fetch>[0], init?: RequestInit) {
  const pathname = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname
  const rawMethod = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")
  const method = typeof rawMethod === "string" && METHODS.has(rawMethod.toUpperCase()) ? rawMethod.toUpperCase() : "other"
  if (pathname.startsWith("/auth/v1/")) {
    return { service: "auth", operation: AUTH_OPERATIONS[pathname] ?? "other", method }
  }
  if (pathname.startsWith("/rest/v1/rpc/")) {
    const rpc = pathname.slice("/rest/v1/rpc/".length)
    return { service: "rest", operation: RPC_OPERATIONS.has(rpc) ? rpc : "other", method }
  }
  if (pathname.startsWith("/rest/v1/")) return { service: "rest", operation: "query", method }
  if (pathname.startsWith("/storage/v1/")) return { service: "storage", operation: "other", method }
  return { service: "other", operation: "other", method }
}

function observe(source: Source, input: Parameters<typeof fetch>[0], init: RequestInit | undefined, timing: Timing | null, response?: Response) {
  // All instrumentation (including clocks, classification and console) fails open.
  try {
    if (!timing) return
    const elapsed = performance.now() - timing.monotonic
    if (!Number.isFinite(elapsed) || elapsed < 0) return
    const status = response?.status ?? null
    const reason: Reason | null = !response ? "network_error"
      : status !== null && (status >= 500 || status === 429) ? "http_error"
      : elapsed >= SLOW_MS ? "slow" : null
    if (!reason) return
    const now = Date.now()
    if (!Number.isFinite(now)) return
    if (now < windowStartedAt || now - windowStartedAt >= WINDOW_MS) {
      windowStartedAt = now
      failures = 0
      slow = 0
    }
    if (reason === "slow" ? slow >= SLOW_BUDGET : failures >= FAILURE_BUDGET) {
      if (reason === "slow") suppressedSlow = Math.min(Number.MAX_SAFE_INTEGER, suppressedSlow + 1)
      else suppressedFailures = Math.min(Number.MAX_SAFE_INTEGER, suppressedFailures + 1)
      return
    }
    if (reason === "slow") slow++
    else failures++
    const requestId = response?.headers.get("sb-request-id")
    const safeRequestId = requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId) ? requestId : undefined
    const event = {
      event: "supabase_request_observation", version: 1, source,
      timestamp: new Date(now).toISOString(), started_at: new Date(timing.startedAt).toISOString(),
      ...classify(input, init), reason, status, duration_ms: Math.round(elapsed),
      timing: "response_headers", ...(safeRequestId ? { supabase_request_id: safeRequestId } : {}),
      suppressed_failures: suppressedFailures, suppressed_slow: suppressedSlow,
    }
    suppressedFailures = 0
    suppressedSlow = 0
    console.warn(JSON.stringify(event))
  } catch { /* Observation must never change a response or rejection. */ }
}

/**
 * Production on by default, local/test off; set SUPABASE_OBSERVABILITY_ENABLED=0
 * to disable or =1 to enable locally. Only completed attempts are observed.
 * duration_ms ends at response headers, excludes body reads, SDK auth queueing
 * and retry backoff, and is not SQL execution time. No timers or extra requests.
 */
export function createObservedSupabaseFetch(source: Source): typeof fetch {
  // Resolve fetch at call time to preserve Next's current patched implementation.
  if (!isEnabled()) return (input, init) => fetch(input, init)
  return async (input, init) => {
    const timing = startTiming()
    let response: Response
    try {
      response = await fetch(input, init)
    } catch (error) {
      observe(source, input, init, timing)
      throw error
    }
    observe(source, input, init, timing, response)
    return response
  }
}
