import type { RoundContentDraft, RoundPurpose } from "@/types"

export function changeRoundPurpose(draft: RoundContentDraft, purpose: RoundPurpose): RoundContentDraft {
  return {
    ...draft,
    purpose,
    contentConfig: purpose === "matching"
      ? { ...draft.contentConfig, eventStart: "", eventEnd: "" }
      : draft.contentConfig,
  }
}
