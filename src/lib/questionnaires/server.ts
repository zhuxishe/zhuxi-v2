import { requireAdmin } from "@/lib/auth/admin"
import { requireAuth, requirePlayer } from "@/lib/auth/player"
import { createClient } from "@/lib/supabase/server"
import { getQuizConfig } from "@/lib/queries/quiz-config"
import type { Json } from "@/types/database.types"
import { buildDefaultTemplate } from "./defaults"
import { validateAnswers, validateTemplate } from "./validation"
import { QUESTIONNAIRE_KINDS, type AdminQuestionnaire, type QuestionnaireAnswers, type QuestionnaireKind, type QuestionnaireRuntime, type QuestionnaireTemplate } from "./types"

type DatabaseError = { code?: string; message?: string; details?: string; hint?: string }
/** Only a missing object from this additive migration permits the legacy form. */
export function isQuestionnaireSchemaMissing(error: DatabaseError | null | undefined): boolean {
  if (!error || !["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "")) return false
  return /(?:questionnaire_(?:templates|versions|responses|assignments)|(?:get_admin|initialize|save|publish|get_my|start_my|save_my)_questionnaire)/i.test(`${error.message ?? ""} ${error.details ?? ""}`)
}
function failure(error: DatabaseError): string {
  if (/QUESTIONNAIRE_REVISION_CONFLICT/.test(error.message ?? "")) return "QUESTIONNAIRE_REVISION_CONFLICT"
  if (/QUESTIONNAIRE_VERSION_CONFLICT/.test(error.message ?? "")) return "QUESTIONNAIRE_VERSION_CONFLICT"
  if (error.code === "42501") return "QUESTIONNAIRE_PERMISSION_DENIED"
  if (["22023", "23514", "22007", "22008", "22P02"].includes(error.code ?? "")) return "QUESTIONNAIRE_INVALID_INPUT"
  return "QUESTIONNAIRE_SAVE_FAILED"
}
function json(value: unknown): Json { return value as Json }
function readRuntime(value: Json | null): QuestionnaireRuntime | null {
  if (value === null) return null
  if (typeof value !== "object" || Array.isArray(value) || !QUESTIONNAIRE_KINDS.includes(value.kind as QuestionnaireKind)
    || typeof value.versionId !== "string" || !value.template || !value.answers || typeof value.revision !== "number") {
    throw new Error("Invalid questionnaire response")
  }
  return value as unknown as QuestionnaireRuntime
}
function readAdmin(value: Json | null): AdminQuestionnaire[] {
  if (!Array.isArray(value)) throw new Error("Invalid administrator questionnaire response")
  return value as unknown as AdminQuestionnaire[]
}
function readDraft(value: Json | null): AdminQuestionnaire {
  if (!value || typeof value !== "object" || Array.isArray(value) || !value.kind || !value.draft) throw new Error("Invalid questionnaire draft response")
  return value as unknown as AdminQuestionnaire
}

/** Initialization is exclusively administrator sourced; player reads never seed templates. */
export async function getAdminQuestionnaires(): Promise<AdminQuestionnaire[] | null> {
  await requireAdmin()
  const client = await createClient()
  const first = await client.rpc("get_admin_questionnaires")
  if (first.error) {
    if (isQuestionnaireSchemaMissing(first.error)) return null
    throw new Error("Unable to load questionnaire templates", { cause: first.error })
  }
  const rows = readAdmin(first.data)
  const missing = QUESTIONNAIRE_KINDS.filter((kind) => !rows.some((row) => row.kind === kind))
  if (!missing.length) return rows
  // Preserve the real legacy quiz configuration instead of resetting it to code defaults.
  const quizConfig = missing.includes("quiz") ? await getQuizConfig() : undefined
  for (const kind of missing) {
    const template = buildDefaultTemplate(kind, kind === "quiz" ? quizConfig : undefined)
    const initialized = await client.rpc("initialize_questionnaire_template", { p_kind: kind, p_template: json(template) })
    if (initialized.error) throw new Error("Unable to initialize questionnaire templates", { cause: initialized.error })
  }
  const loaded = await client.rpc("get_admin_questionnaires")
  if (loaded.error) throw new Error("Unable to load questionnaire templates", { cause: loaded.error })
  return readAdmin(loaded.data)
}

export async function saveQuestionnaireDraft(kind: QuestionnaireKind, expectedRevision: number, template: QuestionnaireTemplate): Promise<{ success: true; draft: AdminQuestionnaire } | { success: false; error: string }> {
  await requireAdmin()
  const rows = await getAdminQuestionnaires()
  const current = rows?.find((row) => row.kind === kind)
  if (!current) return { success: false, error: "QUESTIONNAIRE_SCHEMA_UNAVAILABLE" }
  if (current.revision !== expectedRevision) return { success: false, error: "QUESTIONNAIRE_REVISION_CONFLICT" }
  const validation = validateTemplate(template, current.draft ?? current.baseline)
  if (!validation.ok || template.kind !== kind) return { success: false, error: "QUESTIONNAIRE_INVALID_INPUT" }
  const client = await createClient()
  const { data, error } = await client.rpc("save_questionnaire_draft", { p_kind: kind, p_expected_revision: expectedRevision, p_template: json(validation.data) })
  return error ? { success: false, error: failure(error) } : { success: true, draft: readDraft(data) }
}

export async function publishQuestionnaireDraft(kind: QuestionnaireKind, expectedRevision: number): Promise<{ success: true; draft: AdminQuestionnaire } | { success: false; error: string }> {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { success: false, error: "QUESTIONNAIRE_PERMISSION_DENIED" }
  const client = await createClient()
  const { data, error } = await client.rpc("publish_questionnaire_draft", { p_kind: kind, p_expected_revision: expectedRevision })
  return error ? { success: false, error: failure(error) } : { success: true, draft: readDraft(data) }
}

export async function getPlayerQuestionnaire(kind: QuestionnaireKind): Promise<QuestionnaireRuntime | null> {
  if (kind === "interview") await requireAuth()
  else await requirePlayer()
  const client = await createClient()
  const { data, error } = await client.rpc("get_my_questionnaire", { p_kind: kind })
  if (error) {
    if (isQuestionnaireSchemaMissing(error)) return null
    throw new Error("Unable to load questionnaire", { cause: error })
  }
  return readRuntime(data)
}

export interface SaveQuestionnaireOptions { step?: number; complete?: boolean; expectedRevision?: number }
export async function savePlayerQuestionnaire(kind: QuestionnaireKind, versionId: string, answers: QuestionnaireAnswers, options: SaveQuestionnaireOptions = {}): Promise<{ success: true; runtime: QuestionnaireRuntime } | { success: false; error: string }> {
  const runtime = await getPlayerQuestionnaire(kind)
  if (!runtime) return { success: false, error: "QUESTIONNAIRE_SCHEMA_UNAVAILABLE" }
  if (runtime.versionId !== versionId) return { success: false, error: "QUESTIONNAIRE_VERSION_CONFLICT" }
  const complete = options.complete ?? options.step === undefined
  const sectionId = options.step === undefined ? undefined : ["basic", "academic", "interests", "personality"][options.step - 1]
  if (options.step !== undefined && (kind !== "interview" || !Number.isInteger(options.step) || !sectionId)) return { success: false, error: "QUESTIONNAIRE_INVALID_INPUT" }
  const validated = validateAnswers(runtime.template, answers, { existingAnswers: runtime.answers, ...(sectionId && !complete ? { sectionId } : {}), allowIncomplete: !complete && options.step === undefined })
  if (!validated.ok) return { success: false, error: "QUESTIONNAIRE_INVALID_INPUT" }
  const client = await createClient()
  const { data, error } = await client.rpc("save_my_questionnaire", {
    p_kind: kind, p_version_id: versionId, p_answers: json(validated.data), p_complete: complete,
    ...(options.step !== undefined ? { p_step: options.step } : {}),
    p_expected_revision: options.expectedRevision ?? runtime.revision,
  })
  if (error) return { success: false, error: failure(error) }
  const saved = readRuntime(data)
  if (!saved) throw new Error("Missing saved questionnaire response")
  return { success: true, runtime: saved }
}

export async function startQuestionnaireRetake(kind: "quiz"): Promise<QuestionnaireRuntime | null> {
  await requirePlayer()
  const client = await createClient()
  const { data, error } = await client.rpc("start_my_questionnaire_retake", { p_kind: kind })
  if (error) {
    if (isQuestionnaireSchemaMissing(error)) return null
    throw new Error("Unable to start questionnaire retake", { cause: error })
  }
  return readRuntime(data)
}
