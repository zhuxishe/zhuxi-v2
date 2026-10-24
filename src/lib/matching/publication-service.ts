import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { matchingPublicationError } from "./publication-errors"
import { inspectPublicationPreflight, preparePublicationPreflightInput, type PublicationResultInput } from "./publication-preflight"

type RpcError = { code?: string; message: string }
type RpcClient = { rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{ data: T | null; error: RpcError | null }> }
type PublicationReceipt = { session_id?: string; round_id?: string | null; published?: boolean; already_applied?: boolean }
interface PublicationPreparation extends PublicationReceipt {
  capture?: unknown
  current_rows?: PublicationResultInput[]
  revision_token?: string
}
interface PublicationInput { sessionId: string; actorAdminId: string; reason: string; expectedPublicationVersion: number }
interface PublicationAuthorization extends PublicationReceipt { preflight_id?: string }
export type CheckedPublicationResult = { data: PublicationReceipt; error?: never } | { error: string; data?: never }

const UNKNOWN = "暂时无法确认发布结果，请保留当前版本并刷新核对；请勿另行重复发布。"
const INPUT_INVALID = "暂时无法完整复核当前匹配资料，本次未发布，请刷新核对后重试。"

function prepareArgs(input: PublicationInput) {
  return { p_session_id: input.sessionId, p_actor_admin_id: input.actorAdminId, p_expected_publication_version: input.expectedPublicationVersion }
}

function receipt(data: PublicationReceipt): PublicationReceipt {
  return {
    ...(data.session_id !== undefined ? { session_id: data.session_id } : {}),
    ...(data.round_id !== undefined ? { round_id: data.round_id } : {}),
    ...(data.published !== undefined ? { published: data.published } : {}),
    ...(data.already_applied !== undefined ? { already_applied: data.already_applied } : {}),
  }
}

async function alreadyPublished(db: RpcClient, input: PublicationInput): Promise<PublicationReceipt | null> {
  try {
    const { data, error } = await db.rpc<PublicationPreparation>("admin_prepare_match_publication", prepareArgs(input))
    return !error && data?.already_applied === true && data.published === true ? receipt(data) : null
  } catch { return null }
}

function definiteRejection(error: RpcError | null): boolean {
  return !!error && (/^(MATCH_PUBLICATION_|MATCH_RUN_SERVER_ADMIN_REQUIRED)/.test(error.message)
    || ["22023", "42501", "22P02", "PT409", "23505", "23503"].includes(error.code ?? ""))
}

/**
 * Server-only publication path, called after requireAdmin and audit validation.
 * Current raw inputs never leave this function. Qualification and the exact
 * saved time are inspected without running a scorer or rebuilding a match.
 * The checked transaction independently binds the proof to current inputs.
 */
export async function publishMatchingSession(input: PublicationInput): Promise<CheckedPublicationResult> {
  const db = createAdminClient() as unknown as RpcClient
  let preparation: PublicationPreparation
  try {
    const { data, error } = await db.rpc<PublicationPreparation>("admin_prepare_match_publication", prepareArgs(input))
    if (error) return { error: matchingPublicationError(error, INPUT_INVALID) }
    if (!data) return { error: INPUT_INVALID }
    if (data.already_applied === true && data.published === true) return { data: receipt(data) }
    preparation = data
  } catch { return { error: INPUT_INVALID } }

  try {
    if (!preparation.revision_token || !Array.isArray(preparation.current_rows)) return { error: INPUT_INVALID }
    const engine = preparePublicationPreflightInput(preparation.capture)
    const inspection = inspectPublicationPreflight(engine, preparation.current_rows)
    if (!inspection.passed) {
      const reasons = [...new Set(inspection.issues.map((issue) => issue.message.replace(/[；。]+$/u, "")))]
      return { error: reasons.length ? `${reasons.join("；")}。` : INPUT_INVALID }
    }
  } catch { return { error: INPUT_INVALID } }

  let preflightId: string
  try {
    // Only the server can authorize a successful inspection. This proof grants
    // no permission itself: the final RPC still uses the administrator's auth.
    const { data, error } = await db.rpc<PublicationAuthorization>("admin_authorize_match_publication", {
      ...prepareArgs(input), p_revision_token: preparation.revision_token,
    })
    if (error) return { error: matchingPublicationError(error, INPUT_INVALID) }
    if (data?.already_applied === true && data.published === true) return { data: receipt(data) }
    if (!data?.preflight_id) return { error: INPUT_INVALID }
    preflightId = data.preflight_id
  } catch { return { error: INPUT_INVALID } }

  try {
    const authenticated = await createClient() as unknown as RpcClient
    const { data, error } = await authenticated.rpc<PublicationReceipt>("admin_publish_checked_match_session", {
      p_session_id: input.sessionId, p_expected_publication_version: input.expectedPublicationVersion,
      p_reason: input.reason, p_preflight_id: preflightId,
    })
    if (!error && data?.published === true) return { data: receipt(data) }
    if (definiteRejection(error)) return { error: matchingPublicationError(error, "发布复核未通过，请刷新核对；本次未发布。") }
    const known = await alreadyPublished(db, input)
    return known ? { data: known } : { error: UNKNOWN }
  } catch {
    // A lost response is not evidence of rollback. Read the original version's
    // receipt only; never retry the write or send compensating notifications.
    const known = await alreadyPublished(db, input)
    return known ? { data: known } : { error: UNKNOWN }
  }
}
