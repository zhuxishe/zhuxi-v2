type PublicationError = { code?: string; message: string }

const MESSAGES: Record<string, string> = {
  MATCH_PUBLICATION_CONFLICT: "本轮有成员已在其他已发布结果中，请先撤回或调整冲突结果后再发布",
  MATCH_PUBLICATION_REQUIRES_WITHDRAWAL: "该匹配已发布，请先撤回发布后再调整",
  MATCH_PUBLICATION_SESSION_CHANGED: "发布状态已变化，请刷新后重试；当前操作未生效",
  MATCH_PUBLICATION_STALE: "发布版本或审批状态已变化，请刷新并核对后重试；当前操作未生效",
  MATCH_PUBLICATION_INVALID_RESULT: "匹配结果不完整或存在重复成员，请核对后再发布",
  MATCH_PUBLICATION_INCOMPLETE: "本次匹配尚未完整生成，请刷新并核对后再发布",
  MATCH_PUBLICATION_INVALID_MEMBER: "匹配成员当前不可参与，请核对成员状态后再发布",
  MATCH_PUBLICATION_PREFLIGHT_REQUIRED: "发布前须重新完成资格与硬约束复核，请刷新后重试；本次未发布",
  MATCH_PUBLICATION_PREFLIGHT_STALE: "方案、报名或成员资料在复核后发生变化，请刷新重新复核；本次未发布",
  MATCH_PUBLICATION_PREFLIGHT_EXPIRED: "发布前复核已过期，请刷新重新复核；本次未发布",
  MATCH_PUBLICATION_PREFLIGHT_INVALID: "发布前复核记录无效或不属于当前操作，请刷新后重试；本次未发布",
  MATCH_PUBLICATION_INELIGIBLE: "存在已撤销报名、资料不完整或当前不可参与的成员，请核对后再发布",
  MATCH_PUBLICATION_ADJUSTMENT_BUSY: "该方案仍有正在处理的调整，请先等待完成或恢复原操作后再发布",
  MATCH_PUBLICATION_ORIGINAL_TIME_UNAVAILABLE: "原推荐时间已不是全部成员共同可用的时间，请调整方案后再发布",
  MATCH_PUBLICATION_HARD_CONSTRAINT: "当前成员信息或关系已不满足匹配硬约束，请核对方案后再发布",
  MATCH_PUBLICATION_READ_ONLY: "旧测试匹配记录仅支持查看",
  MATCH_PUBLICATION_NOT_PUBLISHED: "该匹配尚未发布或已撤回，请刷新后重试",
  MATCH_PUBLICATION_NOT_FOUND: "匹配会话不存在，请刷新后重试",
  MATCH_PUBLICATION_BUSY: "该轮次正在执行其他匹配操作，请刷新后重试",
  MATCH_PUBLICATION_REASON_INVALID: "操作理由需为 4–500 个字符",
  MATCH_PUBLICATION_ADMIN_REQUIRED: "当前账号无权执行匹配发布操作",
  MATCH_PUBLICATION_CANCELLATION_NOT_PENDING: "该取消申请已处理或状态已变化，请刷新后核对",
  MATCH_PUBLICATION_EMPTY: "没有可发布的匹配结果",
}

export function matchingPublicationError(error: PublicationError | null, fallback: string): string {
  if (!error) return fallback
  const key = Object.keys(MESSAGES).find((name) => error.message === name || error.message.startsWith(`${name}:`))
  return key ? MESSAGES[key] : fallback
}

export const PUBLISHED_MATCH_EDIT_ERROR = "该匹配已发布，请先撤回发布后再调整"
