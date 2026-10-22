export const MATCHING_PROFILE_KINDS = ["supplementary", "personality", "quiz"] as const
export type MatchingProfileKind = typeof MATCHING_PROFILE_KINDS[number]
export type MatchingReadiness = Record<MatchingProfileKind, boolean> & { missing: MatchingProfileKind[] }

/** Reject incomplete or inconsistent responses instead of silently allowing a registration. */
export function parseMatchingReadiness(value: unknown): MatchingReadiness {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid matching readiness")
  const data = value as Record<string, unknown>
  if (MATCHING_PROFILE_KINDS.some((kind) => typeof data[kind] !== "boolean")) throw new Error("Invalid matching readiness")
  const missing = MATCHING_PROFILE_KINDS.filter((kind) => !data[kind])
  if (!Array.isArray(data.missing) || data.missing.length !== missing.length
    || data.missing.some((kind, index) => kind !== missing[index])) throw new Error("Invalid matching readiness")
  return { supplementary: data.supplementary as boolean, personality: data.personality as boolean, quiz: data.quiz as boolean, missing }
}

export function matchingProfileCopy(locale: string) {
  return locale === "ja" ? {
    labels: { supplementary: "追加情報", personality: "性格自己評価", quiz: "性格テスト" },
    title: "プロフィールを完成させてください",
    description: "マッチングに申し込むには、以下のアンケートを完了してください。完了後、この募集に戻れます。",
    complete: "入力する", cancel: "キャンセル", retry: "再試行", back: "戻る",
    failed: "プロフィールの完了状況を確認できませんでした。もう一度お試しください。",
    checking: "プロフィールを確認中…",
  } : {
    labels: { supplementary: "补充资料", personality: "性格自评", quiz: "性格测试" },
    title: "请先完善资料",
    description: "报名匹配活动前，请先完成以下资料。全部完成后将返回本次活动继续报名。",
    complete: "去完善", cancel: "取消", retry: "重试", back: "返回",
    failed: "暂时无法确认资料完成情况，请重试。",
    checking: "正在检查资料…",
  }
}
