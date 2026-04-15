// ZSP-15 zhuxishe 社交人格量表 — 15题情景选择，覆盖5个维度（Big Five）

export interface QuizOption { text: string; score: number }
export interface QuizQuestion {
  id: number; dimension: 'E' | 'A' | 'O' | 'C' | 'N'
  text: string; options: QuizOption[]
}
export type DimensionScores = { E: number; A: number; O: number; C: number; N: number }

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // E: 社交能量
  { id: 1, dimension: 'E', text: 'zhuxishe 的周末活动，你到了现场发现大部分人你都不认识。你会——',
    options: [
      { text: '主动找看起来也是一个人的同学搭话', score: 6 },
      { text: '先观察一会儿，如果有人看过来就微笑回应', score: 4.5 },
      { text: '找到组织者让他们帮忙介绍', score: 3 },
      { text: '安静等活动正式开始，不急着认识人', score: 1.5 },
    ] },
  { id: 2, dimension: 'E', text: '周五晚上，室友说隔壁研究室的同学约了一群人去居酒屋。你——',
    options: [
      { text: '正好想出去，立刻答应', score: 6 },
      { text: '问一下大概几个人、去哪里，觉得还行就去', score: 4.5 },
      { text: '今天有点累，但室友很想去的话就陪一下', score: 3 },
      { text: '谢了，今晚就想一个人待着充充电', score: 1.5 },
    ] },
  { id: 3, dimension: 'E', text: 'zhuxishe 线上发表会，主持人问「有没有人想分享最近的经历？」你——',
    options: [
      { text: '第一个开麦，正好有个有趣的故事', score: 6 },
      { text: '等别人先讲，如果氛围不错也会分享', score: 4.5 },
      { text: '在聊天框打字分享，比开麦自在一些', score: 3 },
      { text: '安静听别人讲就好，这种场合不太想说', score: 1.5 },
    ] },
  // A: 社交温度
  { id: 4, dimension: 'A', text: 'zhuxishe 多人活动中，小组需要决定策划方案，大家意见不一样。你倾向于——',
    options: [
      { text: '汇总大家的想法，尝试找到一个大家都接受的方案', score: 6 },
      { text: '说出自己的想法，但如果多数人不同意就配合大家', score: 4.5 },
      { text: '提议直接投票，按规则来最公平', score: 3 },
      { text: '坚持自己觉得最好的方案，用逻辑说服大家', score: 1.5 },
    ] },
  { id: 5, dimension: 'A', text: '活动结束后一起吃饭，有个比较安静的同学一直没怎么说话。你——',
    options: [
      { text: '找个话题主动跟TA聊，让TA参与进来', score: 6 },
      { text: '偶尔眼神交流一下，如果TA想加入自然会开口', score: 4.5 },
      { text: '注意到了但不特别做什么，每个人有自己的节奏', score: 3 },
      { text: '没怎么注意，自己聊得挺开心的', score: 1.5 },
    ] },
  { id: 6, dimension: 'A', text: '朋友向你借一笔不算小的钱，说下个月还。你——',
    options: [
      { text: '二话不说就借了，朋友之间不用计较', score: 6 },
      { text: '借了，但委婉提醒一下还款时间', score: 4.5 },
      { text: '根据跟这个人的关系和信任程度决定借不借', score: 3 },
      { text: '找个理由委婉拒绝，借钱的事容易伤感情', score: 1.5 },
    ] },
  // O: 探索倾向
  { id: 7, dimension: 'O', text: 'zhuxishe 推出了一个你从没尝试过的活动类型。你——',
    options: [
      { text: '第一时间报名，没试过的东西才有意思', score: 6 },
      { text: '先了解一下规则和流程，觉得有趣就报', score: 4.5 },
      { text: '看看有没有朋友一起去，一个人不太想尝试新东西', score: 3 },
      { text: '等下次有熟悉类型的活动再参加，不想踩雷', score: 1.5 },
    ] },
  { id: 8, dimension: 'O', text: '来日本后，有个日本同学邀请你参加他们研究室的忘年会。你——',
    options: [
      { text: '太好了，正想体验地道的日本文化', score: 6 },
      { text: '有点好奇，虽然日语不太好但愿意试试', score: 4.5 },
      { text: '犹豫一下，问问有没有其他留学生也去', score: 3 },
      { text: '感觉融入不了，还是跟留学生朋友聚更自在', score: 1.5 },
    ] },
  { id: 9, dimension: 'O', text: '选餐厅吃饭，菜单上有一道你完全没见过的料理。你——',
    options: [
      { text: '直接点了，就喜欢尝新的东西', score: 6 },
      { text: '问一下店员这是什么，觉得能接受就试试', score: 4.5 },
      { text: '先看看别的桌有没有人点，看看实物再说', score: 3 },
      { text: '还是点自己吃过的，不想冒险踩雷', score: 1.5 },
    ] },
  // C: 行动节奏
  { id: 10, dimension: 'C', text: 'zhuxishe 活动通知说「请提前10分钟到达集合点」。你通常——',
    options: [
      { text: '提前15-20分钟到，先熟悉一下环境', score: 6 },
      { text: '提前10分钟准时到达', score: 4.5 },
      { text: '大约准时到，偶尔迟到一两分钟', score: 3 },
      { text: '经常踩着点到或晚几分钟，差不多就行', score: 1.5 },
    ] },
  { id: 11, dimension: 'C', text: '下周有一个重要的小组作业要交。今天是周日，你——',
    options: [
      { text: '已经做完了，今天检查一遍就好', score: 6 },
      { text: '做了大半，今天集中精力收尾', score: 4.5 },
      { text: '还没开始，但心里有个大致计划', score: 3 },
      { text: '还没想呢，还有一周慢慢来', score: 1.5 },
    ] },
  { id: 12, dimension: 'C', text: '朋友约你明天出去玩。你——',
    options: [
      { text: '今晚就查好路线、餐厅和时间安排', score: 6 },
      { text: '大概想一下去哪个方向，细节到时候再说', score: 4.5 },
      { text: '到时候再看吧，随机应变更有趣', score: 3 },
      { text: '完全不想，走到哪算哪', score: 1.5 },
    ] },
  // N: 情绪锚点
  { id: 13, dimension: 'N', text: 'zhuxishe 给你匹配了一个完全不认识的搭档去玩双人本。出发前你——',
    options: [
      { text: '反复想「万一不合拍怎么办」「会不会冷场」', score: 6 },
      { text: '有点忐忑，但告诉自己试试看', score: 4.5 },
      { text: '没什么特别感觉，到时候自然就好', score: 3 },
      { text: '很期待，遇到新的人是一件有趣的事', score: 1.5 },
    ] },
  { id: 14, dimension: 'N', text: '你在群里发了一条消息，过了半小时没人回复。你——',
    options: [
      { text: '开始想是不是自己说了不合适的话', score: 6 },
      { text: '稍微有点在意，但提醒自己大家可能在忙', score: 4.5 },
      { text: '没怎么注意，想看到了自然会回', score: 3 },
      { text: '完全不在意这种事', score: 1.5 },
    ] },
  { id: 15, dimension: 'N', text: '明天有一个重要的面试/发表。今天晚上你——',
    options: [
      { text: '翻来覆去睡不着，脑子里反复预演各种意外', score: 6 },
      { text: '有点紧张，但还是能睡着', score: 4.5 },
      { text: '简单准备一下就睡了', score: 3 },
      { text: '一点不紧张，该干嘛干嘛', score: 1.5 },
    ] },
]

/** 计算各维度标准分 (0-100) */
export function calculateScores(answers: { questionId: number; score: number }[]): DimensionScores {
  const raw: Record<string, number[]> = { E: [], A: [], O: [], C: [], N: [] }
  for (const a of answers) {
    const q = QUIZ_QUESTIONS.find(q => q.id === a.questionId)
    if (q) raw[q.dimension].push(a.score)
  }
  const norm = (arr: number[]) => Math.round(((arr.reduce((a, b) => a + b, 0) - 4.5) / 13.5) * 100)
  return { E: norm(raw.E), A: norm(raw.A), O: norm(raw.O), C: norm(raw.C), N: norm(raw.N) }
}

/** 生成性格类型标签 */
export function generatePersonalityType(scores: DimensionScores): string {
  const mapped = { E: scores.E, A: scores.A, O: scores.O, C: scores.C, ES: 100 - scores.N }
  const sorted = Object.entries(mapped).sort(([, a], [, b]) => b - a)
  const prefix: Record<string, string> = { E: '热情', A: '温暖', O: '好奇', C: '稳健', ES: '从容' }
  const suffix: Record<string, string> = { E: '行动派', A: '守护者', O: '探索者', C: '规划者', ES: '安定者' }
  return `${prefix[sorted[0][0]]}${suffix[sorted[1][0]]}`
}

export const DIMENSION_LABELS: Record<string, string> = {
  E: '外向性', A: '宜人性', O: '开放性', C: '尽责性', N: '神经质',
}
