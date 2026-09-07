import type { User } from "@supabase/supabase-js"

interface UserVerificationClient {
  auth: {
    getUser(): Promise<{ data: { user: User | null }; error: unknown }>
  }
}

const SIGNED_OUT_CODES = new Set([
  "bad_jwt", "invalid_jwt", "no_authorization", "user_not_found",
  "session_not_found", "session_expired", "refresh_token_not_found",
  "refresh_token_already_used", "user_banned",
])

export class AuthTemporarilyUnavailableError extends Error {
  readonly retryable = true

  constructor() {
    super("Authentication is temporarily unavailable. Please try again.")
    this.name = "AuthTemporarilyUnavailableError"
  }
}

function confirmsSignedOut(error: unknown) {
  if (!error || typeof error !== "object") return false
  const { name, status, code } = error as { name?: unknown; status?: unknown; code?: unknown }
  // Infrastructure failures cannot establish that a session is invalid.
  if (name === "AuthRetryableFetchError" || status === 0 || status === 408 || status === 429
    || (typeof status === "number" && status >= 500)) return false
  return name === "AuthSessionMissingError" || name === "AuthInvalidJwtError"
    || status === 401 || status === 403
    || (typeof code === "string" && SIGNED_OUT_CODES.has(code))
}

/** Verify remotely; an unavailable Auth service must not discard a player's draft. */
export async function getVerifiedUser(client: UserVerificationClient): Promise<User | null> {
  let result: Awaited<ReturnType<UserVerificationClient["auth"]["getUser"]>>
  try {
    result = await client.auth.getUser()
  } catch (error) {
    if (confirmsSignedOut(error)) return null
    throw new AuthTemporarilyUnavailableError()
  }
  if (result.error) {
    if (confirmsSignedOut(result.error)) return null
    throw new AuthTemporarilyUnavailableError()
  }
  return result.data.user
}
