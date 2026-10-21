import { isValidBirthDate } from "@/lib/member-master/birth-date"
import { BOOLEAN_FIELDS, buildDefaultTemplate, FIXED_CHOICE_FIELDS, INTERVIEW_CORE_FIELDS, YEAR_FIELDS, quizTemplateToConfig } from "./defaults"
import { QUESTIONNAIRE_KINDS, QUESTION_TYPES } from "./types"
import type { AnswerValidationOptions, Answers, Question, Template, ValidationIssue, ValidationResult } from "./types"
import type { QuizConfig } from "@/types/quiz-config"

const DIMS = ["E", "A", "O", "C", "N"] as const
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/
const unsafe = new Set(["__proto__", "prototype", "constructor"])
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value) && !unsafe.has(value) }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) }
function length(value: string) { return Array.from(value).length }
function text(value: unknown, max: number, empty = false): value is string {
  return typeof value === "string" && length(value) <= max && (empty || value.trim().length > 0)
}
function localized(value: unknown, max: number, empty = false) {
  return record(value) && Object.keys(value).every((key) => key === "zh" || key === "ja") && text(value.zh, max, empty) && text(value.ja, max, empty)
}
function fail<T>(issues: ValidationIssue[]): ValidationResult<T> { return { ok: false, error: issues[0]?.message ?? "Invalid input", issues } }
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b) }
function safeKeys(value: Record<string, unknown>, allowed: readonly string[]) { return Object.keys(value).every((key) => allowed.includes(key) && !unsafe.has(key)) }

function quizIssues(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const issue = (path: string, message: string) => issues.push({ path: `quizConfig.${path}`, message })
  if (!record(value)) return [{ path: "quizConfig", message: "Quiz configuration is required" }]
  if (!safeKeys(value, ["questions", "dimensions", "typeLabels", "typeDescriptions", "scoring"])) issue("", "Unknown quiz configuration field")
  const scoring = value.scoring
  if (!record(scoring) || !finite(scoring.minRaw) || !finite(scoring.maxRaw) || scoring.maxRaw <= scoring.minRaw || scoring.minRaw < 0 || scoring.maxRaw > 1_000_000 || typeof scoring.invertN !== "boolean") issue("scoring", "Invalid quiz scoring range")
  const dimensions = value.dimensions
  let totalWeight = 0
  if (!record(dimensions) || Object.keys(dimensions).length !== 5) issue("dimensions", "Quiz must define exactly five dimensions")
  for (const dim of DIMS) {
    const d = record(dimensions) ? dimensions[dim] : null
    if (!record(d) || !text(d.name, 100) || !finite(d.matchWeight) || d.matchWeight < 0 || d.matchWeight > 1
      || !record(d.descriptions) || !["low", "mid", "high"].every((key) => text(d.descriptions && (d.descriptions as Record<string, unknown>)[key], 4000))) issue(`dimensions.${dim}`, "Invalid quiz dimension")
    else totalWeight += d.matchWeight
  }
  if (Math.abs(totalWeight - 1) > 0.000001) issue("dimensions", "Dimension weights must sum to one")
  for (const mode of ["formal", "fun"]) for (const part of ["prefix", "suffix"]) {
    const labels = record(value.typeLabels) && record(value.typeLabels[mode]) ? value.typeLabels[mode] as Record<string, unknown> : null
    const words = labels && record(labels[part]) ? labels[part] as Record<string, unknown> : null
    if (!words || !["E", "A", "O", "C", "ES"].every((dim) => text(words[dim], 100)) || Object.keys(words).some((key) => unsafe.has(key))) issue(`typeLabels.${mode}.${part}`, "Invalid personality naming configuration")
  }
  if (!record(value.typeDescriptions) || Object.keys(value.typeDescriptions).length > 200) issue("typeDescriptions", "Invalid personality descriptions")
  else for (const [key, description] of Object.entries(value.typeDescriptions)) {
    if (!text(key, 100) || unsafe.has(key) || !record(description) || !text(description.description, 4000)
      || description.imageUrl !== undefined && (!text(description.imageUrl, 2000) || !/^(\/[^/]|https:\/\/)/.test(description.imageUrl))) issue(`typeDescriptions.${key}`, "Invalid personality description")
  }
  if (!Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > 200) issue("questions", "Invalid scored question list")
  else {
    const ids = new Set<number>()
    for (const [index, q] of value.questions.entries()) {
      if (!record(q) || !Number.isSafeInteger(q.id) || (q.id as number) < 1 || ids.has(q.id as number) || !DIMS.includes(q.dimension as typeof DIMS[number]) || !text(q.text, 2000)
        || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 100
        || q.options.some((o) => !record(o) || !text(o.text, 1000) || !finite(o.score) || o.score < 0 || o.score > 1000)) issue(`questions.${index}`, "Invalid scored quiz question")
      if (record(q) && typeof q.id === "number") ids.add(q.id)
    }
  }
  return issues
}

/** Validate a complete draft against trusted code defaults and its previous saved version. */
export function validateTemplate(input: unknown, previous?: Template): ValidationResult<Template> {
  const issues: ValidationIssue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })
  if (!record(input) || !QUESTIONNAIRE_KINDS.includes(input.kind as Template["kind"])) return fail([{ path: "kind", message: "Invalid questionnaire kind" }])
  if (!safeKeys(input, ["kind", "title", "sections", "questions", "quizConfig"])) add("", "Unknown template field")
  if (!localized(input.title, 200)) add("title", "Both questionnaire titles are required and must be at most 200 characters")
  if (previous && previous.kind !== input.kind) add("kind", "Questionnaire kind cannot change")
  if (!Array.isArray(input.sections) || input.sections.length < 1 || input.sections.length > 30) add("sections", "Invalid section list")
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 200) add("questions", "A questionnaire needs 1–200 questions")
  if (input.kind === "quiz") issues.push(...quizIssues(input.quizConfig))
  else if (input.quizConfig !== undefined) add("quizConfig", "Only the quiz may have scoring configuration")
  if (issues.length) return fail(issues)
  const baseline = buildDefaultTemplate(input.kind as Template["kind"])
  const sections = input.sections as Record<string, unknown>[]
  const sectionIds = new Set<string>()
  for (const [i, section] of sections.entries()) {
    if (!record(section) || !safeKeys(section, ["id", "title"]) || !validId(section.id) || sectionIds.has(section.id) || !localized(section.title, 200)) add(`sections.${i}`, "Invalid or duplicate section")
    if (record(section) && typeof section.id === "string") sectionIds.add(section.id)
  }
  if (issues.length) return fail(issues)
  const expectedSections = previous?.sections ?? baseline.sections
  if (!same(sections.map((s) => s.id), expectedSections.map((s) => s.id)) || sections.some((s, i) => !same(s.title, expectedSections[i]?.title))) add("sections", "Existing step IDs, order and titles cannot change")
  const ids = new Set<string>()
  const builtinFields = new Set<string>()
  const questions = input.questions as Record<string, unknown>[]
  for (const [i, q] of questions.entries()) {
    const path = `questions.${i}`
    if (!record(q)) { add(path, "Invalid question"); continue }
    if (!safeKeys(q, ["id", "builtinField", "sectionId", "type", "label", "description", "required", "active", "options", "min", "max", "maxLength", "maxSelections", "locked", "dimension"])) add(path, "Unknown question field")
    if (!validId(q.id) || ids.has(q.id)) add(`${path}.id`, "Question IDs must be safe and unique")
    if (typeof q.id === "string") ids.add(q.id)
    if (typeof q.sectionId !== "string" || !sectionIds.has(q.sectionId)) add(`${path}.sectionId`, "Unknown section")
    if (!QUESTION_TYPES.includes(q.type as Question["type"])) add(`${path}.type`, "Invalid question type")
    if (!localized(q.label, 2000) || q.description !== undefined && !localized(q.description, 4000, true)) add(`${path}.label`, "Invalid bilingual question text")
    if (["required", "active", "locked"].some((key) => typeof q[key] !== "boolean")) add(path, "Question flags must be booleans")
    if (q.builtinField !== undefined && (!validId(q.builtinField) || builtinFields.has(q.builtinField))) add(`${path}.builtinField`, "Invalid or duplicate builtin mapping")
    if (typeof q.builtinField === "string") builtinFields.add(q.builtinField)
    for (const key of ["min", "max", "maxLength", "maxSelections"] as const) if (q[key] !== undefined && !finite(q[key])) add(`${path}.${key}`, "Limits must be finite numbers")
    if (finite(q.min) && finite(q.max) && q.min > q.max) add(path, "Minimum cannot exceed maximum")
    if (q.maxLength !== undefined && (!Number.isInteger(q.maxLength) || (q.maxLength as number) < 1 || (q.maxLength as number) > 20_000)) add(`${path}.maxLength`, "Text limit must be 1–20000")
    if ((q.type === "text" || q.type === "textarea") && q.min !== undefined && (!Number.isInteger(q.min) || (q.min as number) < 0 || (q.min as number) > (finite(q.maxLength) ? q.maxLength : 20_000))) add(`${path}.min`, "Invalid minimum text length")
    if (q.maxSelections !== undefined && (!Number.isInteger(q.maxSelections) || (q.maxSelections as number) < 1 || (q.maxSelections as number) > 200 || q.type !== "multi")) add(`${path}.maxSelections`, "Invalid selection limit")
    if (q.type === "rating" && (!Number.isInteger(q.min) || !Number.isInteger(q.max) || (q.min as number) < 0 || (q.max as number) > 100 || (q.max as number) <= (q.min as number))) add(path, "Ratings need integer bounds between 0 and 100")
    if (q.dimension !== undefined && (input.kind !== "quiz" || q.type !== "single" || !DIMS.includes(q.dimension as typeof DIMS[number]))) add(`${path}.dimension`, "Only scored single-choice quiz questions may have a dimension")
    const isChoice = q.type === "single" || q.type === "multi"
    if (isChoice && (!Array.isArray(q.options) || q.options.length < 1 || q.options.length > 200)) add(`${path}.options`, "Choice questions need 1–200 options")
    if (!isChoice && q.options !== undefined && (!Array.isArray(q.options) || q.options.length !== 0)) add(`${path}.options`, "This question type does not accept options")
    const optionIds = new Set<string>(), values = new Set<string>()
    if (Array.isArray(q.options)) for (const [j, option] of q.options.entries()) {
      if (!record(option) || !safeKeys(option, ["id", "value", "label", "score"]) || !validId(option.id) || optionIds.has(option.id) || !text(option.value, 100) || unsafe.has(option.value) || values.has(option.value) || !localized(option.label, 2000)) add(`${path}.options.${j}`, "Option IDs and stored values must be safe and unique")
      if (record(option)) {
        if (typeof option.id === "string") optionIds.add(option.id)
        if (typeof option.value === "string") values.add(option.value)
        if (YEAR_FIELDS.some((field) => field === q.builtinField) && (!/^\d{4}$/.test(String(option.value)) || Number(option.value) < 1900 || Number(option.value) > 2100)) add(`${path}.options.${j}.value`, "Year options must be integers between 1900 and 2100")
        if (q.dimension && (!finite(option.score) || option.score < 0 || option.score > 1000)) add(`${path}.options.${j}.score`, "Scored options need a finite score between 0 and 1000")
        else if (option.score !== undefined && !finite(option.score)) add(`${path}.options.${j}.score`, "Invalid option score")
      }
    }
    if (finite(q.maxSelections) && Array.isArray(q.options) && q.maxSelections > q.options.length) add(`${path}.maxSelections`, "Selection limit exceeds available options")
  }
  if (issues.length) return fail(issues)
  const candidate = input as unknown as Template
  // Definitions from code cannot be forged by clearing `locked` or builtinField in a draft.
  const protectedQuestions = new Map([...baseline.questions, ...(previous?.questions ?? [])].map((q) => [q.id, q]))
  for (const [id, old] of protectedQuestions) {
    const next = candidate.questions.find((q) => q.id === id)
    if (!next) { add(`questions.${id}`, "Existing questions cannot be deleted; deactivate them instead"); continue }
    if (next.builtinField !== old.builtinField || next.locked !== old.locked) add(`questions.${id}`, "Question identity and builtin mapping cannot change")
    for (const option of old.options ?? []) {
      const updated = next.options?.find((o) => o.id === option.id)
      if (next.type === old.type && (!updated || updated.value !== option.value)) add(`questions.${id}.options`, "Existing stored option IDs and values cannot be removed or renamed")
    }
    if (old.locked && (next.type !== old.type || next.sectionId !== old.sectionId)) add(`questions.${id}`, "Builtin question type and step cannot change")
    if (old.locked) {
      for (const option of old.options ?? []) {
        const updated = next.options?.find((o) => o.id === option.id)
        if (!updated || updated.value !== option.value) add(`questions.${id}.options`, "Existing builtin option IDs and stored values cannot change")
      }
      if (FIXED_CHOICE_FIELDS.some((field) => field === old.builtinField) && (next.options?.length ?? 0) !== (old.options?.length ?? 0)) add(`questions.${id}.options`, "This builtin choice list cannot be expanded")
      for (const key of ["max", "maxLength", "maxSelections"] as const) if (old[key] !== undefined && (next[key] === undefined || next[key]! > old[key]!)) add(`questions.${id}.${key}`, "Builtin validation limits cannot be loosened")
      if (old.min !== undefined && (next.min === undefined || next.min < old.min)) add(`questions.${id}.min`, "Builtin validation limits cannot be loosened")
    }
    if (candidate.kind === "interview" && INTERVIEW_CORE_FIELDS.some((field) => field === old.builtinField) && (!next.active || !next.required)) add(`questions.${id}`, "Core onboarding questions must remain active and required")
  }
  for (const q of candidate.questions) if (!protectedQuestions.has(q.id) && (q.builtinField !== undefined || q.locked)) add(`questions.${q.id}`, "New questions cannot claim a builtin mapping or lock")
  if (candidate.kind === "quiz") {
    for (const dim of DIMS) if (!candidate.questions.some((q) => q.active && q.dimension === dim)) add("questions", `Quiz needs an active scored question in ${dim}`)
    if (!issues.length) issues.push(...quizIssues(quizTemplateToConfig(candidate)))
  }
  return issues.length ? fail(issues) : { ok: true, data: structuredClone(candidate) }
}

function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
function empty(value: unknown) { return value === undefined || value === null || value === "" || Array.isArray(value) && value.length === 0 }

/** The template must be the trusted fixed session version, never a client-supplied draft. */
export function validateAnswers(template: Template, input: unknown, options: AnswerValidationOptions = {}): ValidationResult<Answers> {
  const issues: ValidationIssue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })
  if (!record(input)) return fail([{ path: "answers", message: "Answers must be an object" }])
  if (options.sectionId !== undefined && !template.sections.some((section) => section.id === options.sectionId)) return fail([{ path: "sectionId", message: "Unknown section" }])
  const questions = new Map(template.questions.map((q) => [q.id, q]))
  const existing = options.existingAnswers ?? {}
  const result: Answers = {}
  for (const [key, value] of Object.entries(existing)) if (questions.has(key) && !unsafe.has(key)) result[key] = structuredClone(value)
  for (const [key, value] of Object.entries(input)) {
    const q = questions.get(key)
    if (!q || unsafe.has(key)) { add(key, "Unknown answer field"); continue }
    // Multi-step clients send their whole state; a step save must never overwrite other steps.
    if (options.sectionId !== undefined && q.sectionId !== options.sectionId) continue
    if (!q.active) {
      if (!Object.hasOwn(existing, key) || !same(value, existing[key])) add(key, "This answer cannot be changed in this section")
      continue
    }
    if (empty(value)) {
      if (value === undefined || (typeof value !== "string" && value !== null && !Array.isArray(value))) add(key, "Invalid empty answer")
      else result[key] = Array.isArray(value) ? [] : value as string | null
      continue
    }
    let normalized: unknown = value
    const isBoolean = BOOLEAN_FIELDS.some((field) => field === q.builtinField)
    const isYear = YEAR_FIELDS.some((field) => field === q.builtinField)
    if (q.type === "single") {
      if (isBoolean && (value === "true" || value === "false")) normalized = value === "true"
      else if ((isYear || q.dimension && q.builtinField?.startsWith("quiz_")) && typeof value === "string" && Number.isFinite(Number(value)) && (q.options ?? []).some((o) => o.value === value)) normalized = Number(value)
      const stored = typeof normalized === "boolean" && isBoolean || typeof normalized === "number" && (isYear || q.dimension) ? String(normalized) : normalized
      const known = typeof stored === "string" && q.options?.some((o) => o.value === stored)
      const retained = Object.hasOwn(existing, key) && same(value, existing[key]) && (typeof value === "string" && length(value) <= 100 || isYear && finite(value) && Number.isInteger(value) && value >= 1900 && value <= 2100)
      if (!known && !retained || isBoolean && typeof normalized !== "boolean" || isYear && (!finite(normalized) || !Number.isInteger(normalized) || normalized < 1900 || normalized > 2100) || q.dimension && typeof normalized !== "string" && !finite(normalized)) { add(key, "Invalid choice for this questionnaire version"); continue }
    } else if (q.type === "multi") {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string") || new Set(value).size !== value.length || value.length > (q.maxSelections ?? q.options?.length ?? 200)
        || value.some((item) => !q.options?.some((o) => o.value === item) && !(Array.isArray(existing[key]) && (existing[key] as string[]).includes(item) && length(item) <= 100))) { add(key, "Invalid selections for this questionnaire version"); continue }
      normalized = [...value]
    } else if (q.type === "number" || q.type === "rating") {
      if (!finite(value) || q.min !== undefined && value < q.min || q.max !== undefined && value > q.max || q.type === "rating" && !Number.isInteger(value)) { add(key, "Invalid numeric answer"); continue }
    } else if (q.type === "date") {
      if (typeof value !== "string" || !calendarDate(value) || q.builtinField === "birth_date" && !isValidBirthDate(value)) { add(key, "Invalid calendar date"); continue }
    } else if (q.type === "text" || q.type === "textarea") {
      const prose = typeof value === "string" ? (q.builtinField === "nickname" ? value.normalize("NFKC") : value).trim() : null
      if (prose === null || length(prose) > (q.maxLength ?? 20_000) || q.min !== undefined && length(prose) < q.min) { add(key, "Invalid text answer length"); continue }
      normalized = prose
    } else { add(key, "Unsupported question type"); continue }
    result[key] = normalized as Answers[string]
  }
  if (!options.allowIncomplete) for (const q of template.questions) {
    if (q.active && q.required && (options.sectionId === undefined || q.sectionId === options.sectionId) && (empty(result[q.id]) || typeof result[q.id] === "string" && !(result[q.id] as string).trim())) add(q.id, "A required answer is missing")
  }
  return issues.length ? fail(issues) : { ok: true, data: result }
}

export function isQuestionnaireKind(value: unknown): value is Template["kind"] { return typeof value === "string" && QUESTIONNAIRE_KINDS.some((kind) => kind === value) }
export function validateQuizConfig(value: unknown): ValidationResult<QuizConfig> {
  const issues = quizIssues(value)
  return issues.length ? fail(issues) : { ok: true, data: structuredClone(value as QuizConfig) }
}
