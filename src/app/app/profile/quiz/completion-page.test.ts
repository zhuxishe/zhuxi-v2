import { isValidElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildDefaultTemplate } from "@/lib/questionnaires/defaults"

const mocks = vi.hoisted(() => ({ context: vi.fn(), getQuestionnaire: vi.fn(), query: vi.fn() }))
vi.mock("@/lib/auth/player", () => ({ requirePlayer: async () => ({ memberId: "member" }) }))
vi.mock("@/lib/matching/completion-flow-server", () => ({ matchingQuestionnaireContext: mocks.context }))
vi.mock("@/lib/questionnaires/server", () => ({ getPlayerQuestionnaire: mocks.getQuestionnaire }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.query }) }) }) }) }))
vi.mock("next-intl/server", () => ({ getLocale: async () => "zh", getTranslations: async () => (key: string) => key }))
vi.mock("@/components/player/QuizPageClient", () => ({ QuizPageClient: () => null }))
import QuizPage from "./page"
import { QuizPageClient } from "@/components/player/QuizPageClient"

type Props = { children?: ReactNode; existing?: unknown; completionContext?: unknown }
function find(node: ReactNode): Props | undefined {
  if (Array.isArray(node)) return node.map(find).find(Boolean)
  if (!isValidElement<Props>(node)) return
  return node.type === QuizPageClient ? node.props : find(node.props.children)
}
const saved = { score_e: 50, score_a: 50, score_o: 50, score_c: 50, score_n: 50, personality_type: "balanced" }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.mockResolvedValue({ data: saved, error: null })
  mocks.getQuestionnaire.mockResolvedValue({ kind: "quiz", template: buildDefaultTemplate("quiz"), versionId: "old-version", revision: 0, answers: {}, completed: true, isBaseline: true })
})

describe("quiz completion page for incomplete legacy answers", () => {
  it("opens the questionnaire when readiness rejected an old completed flag", async () => {
    const context = { roundId: "1731d454-c4e9-49f6-8c6c-1cb7ce8ee4db", fromParticipation: true }
    mocks.context.mockResolvedValue(context)
    const props = find(await QuizPage({ searchParams: Promise.resolve({ matchingRound: context.roundId }) }))
    expect(props?.existing).toBeNull()
    expect(props?.completionContext).toEqual(context)
  })
  it("keeps the saved result view for independent profile visits", async () => {
    mocks.context.mockResolvedValue(null)
    const props = find(await QuizPage({ searchParams: Promise.resolve({}) }))
    expect(props?.existing).toEqual({ scores: { E: 50, A: 50, O: 50, C: 50, N: 50 }, personalityType: "balanced" })
  })
})
