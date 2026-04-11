// ZSP-15 竹溪社社交人格量表 — 15题情景选择，覆盖5个维度（Big Five）

import type { QuizConfig } from "@/types/quiz-config"

export interface QuizOption { text: string; score: number }
export interface QuizQuestion {
  id: number; dimension: "E" | "A" | "O" | "C" | "N"
  text: string; options: QuizOption[]
}
export type DimensionScores = { E: number; A: number; O: number; C: number; N: number }

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // E: 社交能量
  { id: 1, dimension: "E", text: "竹溪社的周末活动，你到了现场发现大部分人你都不认识。你会——",
    options: [
      { text: "主动找看起来也是一个人的同学搭话", score: 6 },
      { text: "先观察一会儿，如果有人看过来就微笑回应", score: 4.5 },
      { text: "找到组织者让他们帮忙介绍", score: 3 },
      { text: "安静等活动正式开始，不急着认识人", score: 1.5 },
    ] },
  { id: 2, dimension: "E", text: "周五晚上，室友说隔壁研究室的同学约了一群人去居酒屋。你——",
    options: [
      { text: "正好想出去，立刻答应", score: 6 },
      { text: "问一下大概几个人、去哪里，觉得还行就去", score: 4.5 },
      { text: "今天有点累，但室友很想去的话就陪一下", score: 3 },
      { text: "谢了，今晚就想一个人待着充充电", score: 1.5 },
    ] },
  { id: 3, dimension: "E", text: "竹溪社线上发表会，主持人问「有没有人想分享最近的经历？」你——",
    options: [
      { text: "第一个开麦，正好有个有趣的故事", score: 6 },
      { text: "等别人先讲，如果氛围不错也会分享", score: 4.5 },
      { text: "在聊天框打字分享，比开麦自在一些", score: 3 },
      { text: "安静听别人讲就好，这种场合不太想说", score: 1.5 },
    ] },
  // A: 社交温度
  { id: 4, dimension: "A", text: "竹溪社多人活动中，小组需要决定策划方案，大家意见不一样。你倾向于——",
    options: [
      { text: "汇总大家的想法，尝试找到一个大家都接受的方案", score: 6 },
      { text: "说出自己的想法，但如果多数人不同意就配合大家", score: 4.5 },
      { text: "提议直接投票，按规则来最公平", score: 3 },
      { text: "坚持自己觉得最好的方案，用逻辑说服大家", score: 1.5 },
    ] },
  { id: 5, dimension: "A", text: "活动结束后一起吃饭，有个比较安静的同学一直没怎么说话。你——",
    options: [
      { text: "找个话题主动跟TA聊，让TA参与进来", score: 6 },
      { text: "偶尔眼神交流一下，如果TA想加入自然会开口", score: 4.5 },
      { text: "注意到了但不特别做什么，每个人有自己的节奏", score: 3 },
      { text: "没怎么注意，自己聊得挺开心的", score: 1.5 },
    ] },
  { id: 6, dimension: "A", text: "朋友向你借一笔不算小的钱，说下个月还。你——",
    options: [
      { text: "二话不说就借了，朋友之间不用计较", score: 6 },
      { text: "借了，但委婉提醒一下还款时间", score: 4.5 },
      { text: "根据跟这个人的关系和信任程度决定借不借", score: 3 },
      { text: "找个理由委婉拒绝，借钱的事容易伤感情", score: 1.5 },
    ] },
  // O: 探索倾向
  { id: 7, dimension: "O", text: "竹溪社推出了一个你从没尝试过的活动类型（比如即兴戏剧/户外写生/辩论赛）。你——",
    options: [
      { text: "第一时间报名，没试过的东西才有意思", score: 6 },
      { text: "先了解一下规则和流程，觉得有趣就报", score: 4.5 },
      { text: "看看有没有朋友一起去，一个人不太想尝试新东西", score: 3 },
      { text: "等下次有熟悉类型的活动再参加，不想踩雷", score: 1.5 },
    ] },
  { id: 8, dimension: "O", text: "来日本后，有个日本同学邀请你参加他们研究室的忘年会。你——",
    options: [
      { text: "太好了，正想体验地道的日本文化", score: 6 },
      { text: "有点好奇，虽然日语不太好但愿意试试", score: 4.5 },
      { text: "犹豫一下，问问有没有其他留学生也去", score: 3 },
      { text: "感觉融入不了，还是跟留学生朋友聚更自在", score: 1.5 },
    ] },
  { id: 9, dimension: "O", text: "选餐厅吃饭，菜单上有一道你完全没见过的料理。你——",
    options: [
      { text: "直接点了，就喜欢尝新的东西", score: 6 },
      { text: "问一下店员这是什么，觉得能接受就试试", score: 4.5 },
      { text: "先看看别的桌有没有人点，看看实物再说", score: 3 },
      { text: "还是点自己吃过的，不想冒险踩雷", score: 1.5 },
    ] },
  // C: 行动节奏
  { id: 10, dimension: "C", text: "竹溪社活动通知说「请提前10分钟到达集合点」。你通常——",
    options: [
      { text: "提前15-20分钟到，先熟悉一下环境", score: 6 },
      { text: "提前10分钟准时到达", score: 4.5 },
      { text: "大约准时到，偶尔迟到一两分钟", score: 3 },
      { text: "经常踩着点到或晚几分钟，差不多就行", score: 1.5 },
    ] },
  { id: 11, dimension: "C", text: "下周有一个重要的小组作业要交。今天是周日，你——",
    options: [
      { text: "已经做完了，今天检查一遍就好", score: 6 },
      { text: "做了大半，今天集中精力收尾", score: 4.5 },
      { text: "还没开始，但心里有个大致计划", score: 3 },
      { text: "还没想呢，还有一周慢慢来", score: 1.5 },
    ] },
  { id: 12, dimension: "C", text: "朋友约你明天出去玩。你——",
    options: [
      { text: "今晚就查好路线、餐厅和时间安排", score: 6 },
      { text: "大概想一下去哪个方向，细节到时候再说", score: 4.5 },
      { text: "到时候再看吧，随机应变更有趣", score: 3 },
      { text: "完全不想，走到哪算哪", score: 1.5 },
    ] },
  // N: 情绪锚点
  { id: 13, dimension: "N", text: "竹溪社给你匹配了一个完全不认识的搭档去玩双人本。出发前你——",
    options: [
      { text: "反复想「万一不合拍怎么办」「会不会冷场」", score: 6 },
      { text: "有点忐忑，但告诉自己试试看", score: 4.5 },
      { text: "没什么特别感觉，到时候自然就好", score: 3 },
      { text: "很期待，遇到新的人是一件有趣的事", score: 1.5 },
    ] },
  { id: 14, dimension: "N", text: "你在群里发了一条消息，过了半小时没人回复。你——",
    options: [
      { text: "开始想是不是自己说了不合适的话", score: 6 },
      { text: "稍微有点在意，但提醒自己大家可能在忙", score: 4.5 },
      { text: "没怎么注意，想看到了自然会回", score: 3 },
      { text: "完全不在意这种事", score: 1.5 },
    ] },
  { id: 15, dimension: "N", text: "明天有一个重要的面试/发表。今天晚上你——",
    options: [
      { text: "翻来覆去睡不着，脑子里反复预演各种意外", score: 6 },
      { text: "有点紧张，但还是能睡着", score: 4.5 },
      { text: "简单准备一下就睡了", score: 3 },
      { text: "一点不紧张，该干嘛干嘛", score: 1.5 },
    ] },
]

/** 计算各维度标准分 (0-100)。公式: (原始分 - 4.5) / 13.5 * 100 */
export function calculateScores(answers: { questionId: number; score: number }[]): DimensionScores {
  const raw: Record<string, number[]> = { E: [], A: [], O: [], C: [], N: [] }
  for (const a of answers) {
    const q = QUIZ_QUESTIONS.find((q) => q.id === a.questionId)
    if (q) raw[q.dimension].push(a.score)
  }
  const n = (arr: number[]) => Math.round(((arr.reduce((a, b) => a + b, 0) - 4.5) / 13.5) * 100)
  return { E: n(raw.E), A: n(raw.A), O: n(raw.O), C: n(raw.C), N: n(raw.N) }
}

/** 生成性格类型标签（最高维度前缀 + 次高维度后缀） */
export function generatePersonalityType(scores: DimensionScores): string {
  // N 维度转换为情绪稳定性 ES
  const mapped = { E: scores.E, A: scores.A, O: scores.O, C: scores.C, ES: 100 - scores.N }
  const sorted = Object.entries(mapped).sort(([, a], [, b]) => b - a)
  const [first] = sorted[0]
  const [second] = sorted[1]

  const prefix: Record<string, string> = { E: "热情", A: "温暖", O: "好奇", C: "稳健", ES: "从容" }
  const suffix: Record<string, string> = { E: "行动派", A: "守护者", O: "探索者", C: "规划者", ES: "安定者" }

  return `${prefix[first]}${suffix[second]}`
}

/** 从硬编码常量构建默认配置（DB 无数据时使用） */
export function buildDefaultQuizConfig(): QuizConfig {
  return {
    questions: QUIZ_QUESTIONS,
    dimensions: {
      E: { name: "社交能量", matchWeight: 0.3, descriptions: { low: "你的电量靠独处回血，人多的地方是你的耗电模式。", mid: "社交和独处都行，看当天心情和在场的人。", high: "人越多你越来劲，安静反而让你浑身不自在。" } },
      A: { name: "社交温度", matchWeight: 0.3, descriptions: { low: "你重效率和逻辑，不太会因为「不好意思」而改变决定。", mid: "该暖的时候暖，该硬的时候也不含糊，温度随场景调节。", high: "你天然在意别人的感受，聚会里那个默默照顾所有人的往往是你。" } },
      O: { name: "探索倾向", matchWeight: 0.15, descriptions: { low: "你喜欢确定性，熟悉的东西让你安心，冒险请找别人。", mid: "新事物要先看看评价，确认安全了再下手。", high: "「没试过」三个字对你来说不是警告，是邀请函。" } },
      C: { name: "行动节奏", matchWeight: 0.1, descriptions: { low: "计划是什么？能吃吗？你和deadline有一种微妙的默契——总在最后一刻相遇。", mid: "大方向有，细节随缘，不至于翻车但也不追求满分。", high: "出门前查路线、列清单、算时间，你的日程表比瑞士钟表还准。" } },
      N: { name: "情绪锚点", matchWeight: 0.15, descriptions: { low: "你的内心像装了减震器，外面风浪再大，里面波澜不惊。", mid: "大部分时候稳得住，偶尔也会被突发状况晃一下。", high: "你的情绪雷达灵敏度拉满，别人一个眼神你就能脑补出一部电影。" } },
    },
    typeLabels: {
      formal: {
        prefix: { E: "热情", A: "温暖", O: "好奇", C: "稳健", ES: "从容" },
        suffix: { E: "行动派", A: "守护者", O: "探索者", C: "规划者", ES: "安定者" },
      },
      fun: {
        prefix: { E: "话唠", A: "暖宝宝", O: "野生", C: "靠谱", ES: "佛系" },
        suffix: { E: "冲锋鸡", A: "奶妈", O: "冒险王", C: "表格侠", ES: "定海神针" },
      },
    },
    typeDescriptions: DEFAULT_TYPE_DESCRIPTIONS,
    scoring: { minRaw: 4.5, maxRaw: 18, invertN: true },
  }
}

const IMG = "/images/personality"

const DEFAULT_TYPE_DESCRIPTIONS: QuizConfig["typeDescriptions"] = {
  "热情守护者": { description: "恭喜你获得了聚会的灵魂+保姆双重认证！你天生自带麦克风光环，能让陌生人三分钟内变成老朋友，还会悄悄记住每个人的过敏原和忌口。你的存在让社群像一个24小时营业的暖气团。", imageUrl: `${IMG}/enthusiastic-guardian.png` },
  "热情探索者": { description: "你是那种在聚餐时能把「我最近在研究量子力学」说得比菜单更令人期待的人。社交对你来说是田野调查，每一个新朋友都是一扇通往平行宇宙的门。", imageUrl: `${IMG}/enthusiastic-explorer.png` },
  "热情规划者": { description: "派对有你在，时间表比地铁班次还精准，但氛围却比自由市场还热烈——这是只有你能做到的魔法。活动还没结束，下一场的群已经建好了。", imageUrl: `${IMG}/enthusiastic-planner.png` },
  "热情安定者": { description: "你是社群的天然稳压器——人多的地方你能带动气氛，场面失控时你又能轻描淡写地接住一切。别人社交完需要充电，你充的就是社交本身。", imageUrl: `${IMG}/enthusiastic-stabilizer.png` },
  "温暖行动派": { description: "你是那种「说走就走」后面还会加一句「我来定酒店」的人。你用行动诠释关心，用速度证明温度——在你这里，爱是动词，而且是现在进行时。", imageUrl: `${IMG}/warm-activist.png` },
  "温暖探索者": { description: "你问问题的方式像温水，让人不知不觉就说了很多真心话。你收集故事，但不消费故事；你了解别人，但不定义别人——这是很稀有的能力。", imageUrl: `${IMG}/warm-explorer.png` },
  "温暖规划者": { description: "你是那种会在朋友生日前三周就悄悄备好惊喜方案的人，还能确保对乳糖不耐受的那位也有蛋糕吃。你把细心变成了系统工程，把在乎变成了可执行的清单。", imageUrl: `${IMG}/warm-planner.png` },
  "温暖安定者": { description: "你是社群里那把永远坐着的椅子——不会主动冲到最前面，但每个需要坐下来的人都会本能地找到你。有你在的群，撕不起来，因为大家都不好意思。", imageUrl: `${IMG}/warm-stabilizer.png` },
  "好奇行动派": { description: "你的人生信条大概是：与其想明白，不如先试试。你把「有趣」当作第一行动准则，在别人还在做可行性分析的时候，你已经拿到了结论并开始想下一个问题了。", imageUrl: `${IMG}/curious-activist.png` },
  "好奇守护者": { description: "你的好奇心不只指向知识，更指向人——你真心想知道每一个人背后的故事，而且会在他们说完之后，替他们好好保管这段故事。", imageUrl: `${IMG}/curious-guardian.png` },
  "好奇规划者": { description: "你是那种会做出十页调研报告然后说「我们下周去试试」的人。在你眼里，任何有趣的事都值得认真对待，任何认真的事也都可以变得有趣。", imageUrl: `${IMG}/curious-planner.png` },
  "好奇安定者": { description: "你很少着急，但你几乎什么都感兴趣——这让你成为最好的聊天对象。你的平静里藏着一个安静运转的宇宙。", imageUrl: `${IMG}/curious-stabilizer.png` },
  "稳健行动派": { description: "你不是最先举手的那个，但你是真的把事情做完的那个。有你参与的活动，细节不会漏，突发不会乱——你是那种让团队集体睡个好觉的人。", imageUrl: `${IMG}/steady-activist.png` },
  "稳健守护者": { description: "你不会说很多话，但你说的每一句都会被记住。你用一致性建立信任，用耐心建立关系。朋友们心里都清楚：在所有人里，你是那个最不会让人失望的。", imageUrl: `${IMG}/steady-guardian.png` },
  "稳健探索者": { description: "你探索新事物的方式像地质勘测——不冲动，但很深入。你的知识体系不是百科词条式的，而是有脉络的，是你真正走过、想过、验证过的版图。", imageUrl: `${IMG}/steady-explorer.png` },
  "稳健安定者": { description: "你是社群里那座不显眼但谁都靠得住的山。不抢风头，不制造张力，但在关键时刻总是稳稳地在那里。你不需要被夸，但每个人心里都知道你有多重要。", imageUrl: `${IMG}/steady-stabilizer.png` },
  "从容行动派": { description: "你是「说走就走」但从不慌乱的那种人——行李永远只有一个包，但你始终是最先到达又最早适应的那个。你的淡定不是冷漠，是一种对自己的深度信任。", imageUrl: `${IMG}/serene-activist.png` },
  "从容守护者": { description: "你不会大声说「我关心你」，但你会在对方还没意识到自己需要帮助的时候，就已经轻轻递过去了。你的关怀不黏腻，你的陪伴不消耗人。", imageUrl: `${IMG}/serene-guardian.png` },
  "从容探索者": { description: "你对新事物充满兴趣，但不执着于结论——「有意思」对你来说本身就是目的地。你探索世界的姿态很松弛，像是在散步，不像在赶路。", imageUrl: `${IMG}/serene-explorer.png` },
  "从容规划者": { description: "你的计划不是为了控制，而是为了让自己可以更放松地享受过程。有条理给了你自由，而不是束缚——这个逻辑大多数人搞反了，但你天生就懂。", imageUrl: `${IMG}/serene-planner.png` },
}
