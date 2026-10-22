import { describe, expect, it } from "vitest"
import { buildPersonalityDraft, buildSupplementaryDraft, parseSupplementary } from "@/lib/forms/player-enrichment"
import { answersFromLegacy, buildDefaultTemplate } from "@/lib/questionnaires/defaults"
import { validateAnswers } from "@/lib/questionnaires/validation"
import type { QuestionnaireRuntime } from "@/lib/questionnaires/types"
import { questionnaireContext, questionnaireLegacy } from "./questionnaire-client"

function runtime(kind: QuestionnaireRuntime["kind"], source: Record<string, unknown>): QuestionnaireRuntime {
  const template = buildDefaultTemplate(kind)
  return { kind, template, versionId: "saved-version", answers: answersFromLegacy(template, source), isBaseline: true, completed: true, revision: 1 }
}

describe("restoring nullable legacy questionnaire answers", () => {
  it("keeps database null text and tags editable and allows an optional supplementary submission", () => {
    const source = Object.fromEntries(buildDefaultTemplate("supplementary").questions.map((question) => [question.id, null]))
    const pinned = runtime("supplementary", source)
    const draft = questionnaireLegacy(pinned, buildSupplementaryDraft(source, source))

    expect(draft.nearest_station).toBe("")
    expect(draft.activity_area).toBe("")
    expect(draft.communication_language_pref).toEqual([])
    expect(draft.scenario_mode_pref).toEqual([])
    expect(draft.script_preference).toEqual([])
    expect(draft.graduation_year).toBeNull()
    expect(draft.accept_beginners).toBeNull()
    expect(parseSupplementary(draft)).toEqual(draft)
    expect(validateAnswers(pinned.template, questionnaireContext(pinned, draft)!.answers, { existingAnswers: pinned.answers }).ok).toBe(true)
    expect(pinned.answers.nearest_station).toBeNull()
  })

  it("restores explicit empty answers without reviving stale legacy text or tags", () => {
    const pinned = runtime("supplementary", { nearest_station: null, script_preference: null })
    const previous = buildSupplementaryDraft({ nearest_station: "旧车站", script_preference: ["经典本"] }, null)
    const draft = questionnaireLegacy(pinned, previous)
    expect(draft.nearest_station).toBe("")
    expect(draft.script_preference).toEqual([])
    expect(previous.nearest_station).toBe("旧车站")
    expect(previous.script_preference).toEqual(["经典本"])
  })

  it("preserves false, a historical graduation year and unrelated legacy fields", () => {
    const pinned = runtime("supplementary", { accept_beginners: false, accept_cross_school: false, graduation_year: 2024 })
    const previous = { ...buildSupplementaryDraft(null, null), untouched: "keep" }
    const draft = questionnaireLegacy(pinned, previous)
    expect(draft).toMatchObject({ accept_beginners: false, accept_cross_school: false, graduation_year: 2024, untouched: "keep" })
  })

  it("keeps unanswered personality ratings null rather than inventing a score", () => {
    const source = { extroversion: null, initiative: 4, emotional_stability: null, expression_style_tags: null, group_role_tags: ["组织者"], warmup_speed: null }
    const pinned = runtime("personality", source)
    const draft = questionnaireLegacy(pinned, buildPersonalityDraft(source))
    expect(draft).toMatchObject({ extroversion: null, initiative: 4, emotional_stability: null, expression_style_tags: [], group_role_tags: ["组织者"], warmup_speed: "" })
  })

  it("preserves custom zero and null answers in the versioned submission", () => {
    const pinned = runtime("supplementary", { nearest_station: null })
    pinned.isBaseline = false
    pinned.answers = { ...pinned.answers, custom_number: 0, custom_text: null }
    const original = structuredClone(pinned.answers)
    const draft = questionnaireLegacy(pinned, buildSupplementaryDraft(null, null))
    expect(questionnaireContext(pinned, draft)?.answers).toEqual(original)
    expect(pinned.answers).toEqual(original)
  })
})
