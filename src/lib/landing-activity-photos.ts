import type { PastEventReviewPublic } from "@/lib/queries/past-event-reviews"

const base = "/images/landing/activity-wall-20260520"
const img = (name: string) => `${base}/${name}`
const seq = (slug: string, count: number) => Array.from({ length: count }, (_, i) => img(`${slug}-${String(i + 1).padStart(2, "0")}.webp`))

const events = [
  {
    id: "zhuxi-founded",
    slug: "founded",
    count: 2,
    date: "2025-04-19",
    title: ["竹溪社正式成立", "竹渓社設立"],
    summary: ["14 位东京留学生从第一场见面开始，把这个社团做了起来。", "14人の東京の留学生が、最初の集まりからこのサークルを始めました。"],
  },
  {
    id: "asakusa-omamori",
    slug: "asakusa",
    count: 9,
    date: "2025-07-09",
    title: ["双人本：浅草手工御守", "二人企画：浅草お守り作り"],
    summary: ["一起做手作、逛浅草，把聊天放进具体的一天里。", "手作りと浅草散歩を通して、自然に話せる一日です。"],
  },
  {
    id: "kichijoji-trip",
    slug: "kichijoji",
    count: 6,
    date: "2025-07-09",
    title: ["双人本：吉祥寺一日游", "二人企画：吉祥寺散歩"],
    summary: ["从湖边到小店，适合慢慢走、慢慢聊。", "湖や小さなお店をめぐりながら、ゆっくり話せます。"],
  },
  {
    id: "daiba-city",
    slug: "daiba",
    count: 6,
    date: "2025-07-09",
    title: ["双人本：台场都市巡游", "二人企画：台場めぐり"],
    summary: ["室内游乐、海边散步、城市夜景，一天有很多停靠点。", "屋内遊び、海辺の散歩、夜景まで楽しめる街歩きです。"],
  },
  {
    id: "tokyo-tower",
    slug: "tokyo-tower",
    count: 1,
    date: "2025-07-09",
    title: ["落日余晖下的东京塔", "夕暮れの東京タワー"],
    summary: ["城市里的短暂停靠，也可以成为一次活动的记忆。", "街の中の短い寄り道も、活動の思い出になります。"],
  },
  {
    id: "disney-trip",
    slug: "disney",
    count: 9,
    date: "2025-07-09",
    title: ["竹溪社第一次团建", "竹渓社初のチーム活動"],
    summary: ["一起去迪士尼，把第一次团建留在夏天。", "ディズニーで過ごした、初めてのチーム活動です。"],
  },
  {
    id: "hogwarts-trip",
    slug: "hogwarts",
    count: 9,
    date: "2025-07-10",
    title: ["双人本：霍格沃茨魔法世界", "二人企画：魔法世界めぐり"],
    summary: ["主题场景和小任务，让同好更容易找到话题。", "テーマのある場所と小さなタスクで、会話が始まりやすくなります。"],
  },
  {
    id: "maneki-neko",
    slug: "maneki",
    count: 1,
    date: "2025-07-10",
    title: ["双人本：手绘招财猫", "二人企画：招き猫ペイント"],
    summary: ["手绘、猫咖、复古街道，适合喜欢小物和散步的人。", "絵付け、猫カフェ、レトロな街歩きを楽しむ回です。"],
  },
  {
    id: "showa-park",
    slug: "showa",
    count: 9,
    date: "2025-07-10",
    title: ["双人/多人本：昭和纪念公园", "二人・複数人企画：昭和記念公園"],
    summary: ["自行车、飞盘、花火和点灯，户外活动可以很松弛。", "自転車、フリスビー、花火、ライトアップを楽しむ屋外企画です。"],
  },
  {
    id: "boardgame-party",
    slug: "boardgame",
    count: 6,
    date: "2025-10-13",
    title: ["桌游派对", "ボードゲーム会"],
    summary: ["围桌玩一局，再从游戏话题延伸到聊天。", "一緒に遊びながら、自然に会話が広がります。"],
  },
  {
    id: "shibuya-party",
    slug: "shibuya-party",
    count: 9,
    date: "2025-10-19",
    title: ["涩谷线下交友派对", "渋谷オフライン交流会"],
    summary: ["第一场大型玩家欢迎会，把不同学校的人带到同一张桌边。", "初めての大型歓迎会で、違う学校の人たちが同じ場に集まりました。"],
  },
  {
    id: "autumn-trip",
    slug: "autumn-trip",
    count: 9,
    date: "2025-11-02",
    title: ["秋游计划", "秋の遠足企画"],
    summary: ["去东京近郊走一走，用户外任务和小组游戏打开周末。", "東京近郊での散歩とチームゲームで週末を過ごす企画です。"],
  },
  {
    id: "team-games",
    slug: "team-game",
    count: 9,
    date: "2025-11-15",
    title: ["团队合作游戏局", "チームゲーム会"],
    summary: ["分组闯关、选代号、猜卧底，第一次见面也有共同目标。", "チームで挑戦し、初対面でも共通の目的を持てる回です。"],
  },
  {
    id: "bbq-gathering",
    slug: "bbq",
    count: 9,
    date: "2025-11-24",
    title: ["台场 BBQ 团建", "台場 BBQ"],
    summary: ["海边、烤肉、聊天，活动后的关系更容易延续。", "海辺でBBQをしながら、活動後もつながりやすい時間です。"],
  },
  {
    id: "kpop-party",
    slug: "kpop",
    count: 1,
    date: "2025-12-21",
    title: ["Kpop 睡衣派对", "Kpopパジャマパーティー"],
    summary: ["猜歌、宾果、零食和聊天，给 2025 年收个轻松的尾。", "曲当て、ビンゴ、お菓子と会話で、2025年を締めくくりました。"],
  },
] as const

export function getLandingEventReviews(locale: string): PastEventReviewPublic[] {
  const index = locale === "ja" ? 1 : 0
  return events.map((event) => {
    const photos = seq(event.slug, event.count)
    return {
      id: event.id,
      title: event.title[index],
      summary: event.summary[index],
      event_date: event.date,
      cover_url: photos[0],
      gallery_urls: photos.slice(1),
      source_url: null,
    }
  })
}
