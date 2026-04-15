export const GAME_TYPES = ['双人', '多人', '都可以']
export const GENDER_PREFS = ['男', '女', '都可以']
export const INTEREST_TAGS = ['推理本', '情感本', '恐怖本', '欢乐本', '机制本', '阵营本', '沉浸本']
export const SOCIAL_STYLES = ['慢热', '活跃', '善于倾听', '话题广', '温和', '喜欢竞技']
export const TIME_SLOTS = ['上午', '下午', '晚上']

/** 用本地时区生成未来14天的日期字符串 YYYY-MM-DD */
export function getNext14Days(): string[] {
  const days: string[] = []
  const now = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    days.push(`${yyyy}-${mm}-${dd}`)
  }
  return days
}

export function formatDate(dateStr: string): string {
  // 解析为本地日期，避免 new Date('YYYY-MM-DD') 的 UTC 偏移
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `${date.getMonth() + 1}/${date.getDate()} (${weekdays[date.getDay()]})`
}
