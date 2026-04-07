/**
 * 竹溪社首轮匹配 — 主入口 (re-export)
 */

export { scorePair } from "./scorer"
export { checkHardConstraints } from "./constraints"
export { groupByTimeSlot, getCommonSlots, hasCommonSlot, getAvailabilityHeatmap } from "./time-filter"
export { jaccard, complementScore } from "./similarity"
export { DEFAULT_CONFIG } from "./config"
export type * from "./types"

export { runDuoMatching } from "./duo-matching"
export { runMultiMatching } from "./multi-matching"
