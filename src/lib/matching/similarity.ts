/**
 * 竹溪社匹配算法 — 相似度与互补度计算
 */

/**
 * Jaccard 相似度: |A ∩ B| / |A ∪ B|
 * 两个集合都为空时返回 0 (无信息 = 无匹配依据)
 */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const item of setA) {
    if (setB.has(item)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * 标签重合度: |A ∩ B| / max(|A|, |B|)
 * 比 Jaccard 更适合长度不对称的情况
 */
export function overlapCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const item of setA) {
    if (setB.has(item)) intersection++
  }
  return intersection / Math.min(setA.size, setB.size)
}

/**
 * 互补度评分: 在预定义的互补配对表中，找到 A 和 B 各自贡献了多少组互补对。
 *
 * 例如互补表 = [["慢热","活跃"], ["善于倾听","话题广"]]
 * A=["慢热","善于倾听"], B=["活跃"] → 匹配了 1 组 → score = 1/2 = 0.5
 */
export function complementScore(
  a: string[],
  b: string[],
  complementPairs: [string, string][],
): number {
  if (complementPairs.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let matched = 0
  for (const [x, y] of complementPairs) {
    // A 有 x 且 B 有 y，或 A 有 y 且 B 有 x
    if ((setA.has(x) && setB.has(y)) || (setA.has(y) && setB.has(x))) {
      matched++
    }
  }
  return matched / complementPairs.length
}

/**
 * 从自由文本中提取关键词，与标签集合做模糊匹配。
 * 返回匹配到的标签列表。
 */
export function extractKeywordsFromText(
  text: string,
  targetTags: string[],
): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  return targetTags.filter((tag) => lower.includes(tag.toLowerCase()))
}
