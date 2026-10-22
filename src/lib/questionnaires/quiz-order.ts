/** Original deterministic Fisher–Yates order, shared by both quiz renderers. */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const result = [...items]
  let state = seed
  for (let index = result.length - 1; index > 0; index--) {
    state = (state * 9301 + 49297) % 233280
    const target = Math.floor((state / 233280) * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

/** Retain id * 137 for original numeric questions; new IDs get a stable seed. */
export function quizOptionSeed(question: { id: string; builtinField?: string }): number {
  const stableId = question.builtinField ?? question.id
  const originalId = /^quiz_(\d+)$/.exec(stableId)
  if (originalId && Number.isSafeInteger(Number(originalId[1]))) return Number(originalId[1]) * 137
  let hash = 2166136261
  for (let index = 0; index < stableId.length; index++) {
    hash = Math.imul(hash ^ stableId.charCodeAt(index), 16777619) >>> 0
  }
  return hash * 137
}
