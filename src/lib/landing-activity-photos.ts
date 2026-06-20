import type { PastEventReviewPublic } from "@/lib/queries/past-event-reviews"

const base = "/images/landing/activity-wall-20260520"
const img = (name: string) => `${base}/${name}`
const seq = (slug: string, count: number) => Array.from({ length: count }, (_, i) => {
  const index = String(i + 1).padStart(2, "0")
  return img(slug === "asakusa" && i === 0 ? "asakusa-01-masked.webp" : `${slug}-${index}.webp`)
})

const events = [
  {
    id: "zhuxi-founded",
    slug: "founded",
    count: 1, category: "large",
    date: "2025-04-19",
    title: ["竹溪社正式成立", "竹渓社設立"],
    summary: ["竹溪社在东京正式成立。", "竹渓社が東京で設立されました。"],
  },
  {
    id: "asakusa-omamori",
    slug: "asakusa",
    count: 9, category: "script",
    date: "2025-07-09",
    title: ["双人本：浅草手工御守", "二人企画：浅草お守り作り"],
    summary: ["一起做手作、逛浅草，把聊天放进具体的一天里。", "手作りと浅草散歩を通して、自然に話せる一日です。"],
  },
  {
    id: "kichijoji-trip",
    slug: "kichijoji",
    count: 6, category: "script",
    date: "2025-07-09",
    title: ["双人本：吉祥寺一日游", "二人企画：吉祥寺散歩"],
    summary: ["从湖边到小店，适合慢慢走、慢慢聊。", "湖や小さなお店をめぐりながら、ゆっくり話せます。"],
  },
  {
    id: "daiba-city",
    slug: "daiba",
    count: 6, category: "script",
    date: "2025-07-09",
    title: ["双人本：台场都市巡游", "二人企画：台場めぐり"],
    summary: ["室内游乐、海边散步、城市夜景，一天有很多停靠点。", "屋内遊び、海辺の散歩、夜景まで楽しめる街歩きです。"],
  },
  {
    id: "disney-trip",
    slug: "disney",
    count: 9, category: "large",
    date: "2025-07-09",
    title: ["竹溪社第一次团建", "竹渓社初のチーム活動"],
    summary: ["一起去迪士尼，把第一次团建留在夏天。", "ディズニーで過ごした、初めてのチーム活動です。"],
  },
  {
    id: "hogwarts-trip",
    slug: "hogwarts",
    count: 9, category: "script",
    date: "2025-07-10",
    title: ["双人本：霍格沃茨魔法世界", "二人企画：魔法世界めぐり"],
    summary: ["主题场景和小任务，让同好更容易找到话题。", "テーマのある場所と小さなタスクで、会話が始まりやすくなります。"],
  },
  {
    id: "maneki-neko",
    slug: "maneki",
    count: 1, category: "script",
    date: "2025-07-10",
    title: ["双人本：手绘招财猫", "二人企画：招き猫ペイント"],
    summary: ["手绘、猫咖、复古街道，适合喜欢小物和散步的人。", "絵付け、猫カフェ、レトロな街歩きを楽しむ回です。"],
  },
  {
    id: "showa-park",
    slug: "showa",
    count: 9, category: "script",
    date: "2025-07-10",
    title: ["双人/多人本：昭和纪念公园", "二人・複数人企画：昭和記念公園"],
    summary: ["自行车、飞盘、花火和点灯，户外活动可以很松弛。", "自転車、フリスビー、花火、ライトアップを楽しむ屋外企画です。"],
  },
  {
    id: "boardgame-party",
    slug: "boardgame",
    count: 6, category: "large",
    date: "2025-10-13",
    title: ["桌游派对", "ボードゲーム会"],
    summary: ["围桌玩一局，再从游戏话题延伸到聊天。", "一緒に遊びながら、自然に会話が広がります。"],
  },
  {
    id: "shibuya-party",
    slug: "shibuya-party",
    count: 9, category: "large",
    date: "2025-10-19",
    title: ["涩谷线下交友派对", "渋谷オフライン交流会"],
    summary: ["第一场大型玩家欢迎会，把不同学校的人带到同一张桌边。", "初めての大型歓迎会で、違う学校の人たちが同じ場に集まりました。"],
  },
  {
    id: "autumn-trip",
    slug: "autumn-trip",
    count: 9, category: "large",
    date: "2025-11-02",
    title: ["秋游计划", "秋の遠足企画"],
    summary: ["去东京近郊走一走，用户外任务和小组游戏打开周末。", "東京近郊での散歩とチームゲームで週末を過ごす企画です。"],
  },
  {
    id: "team-games",
    slug: "team-game",
    count: 9, category: "large",
    date: "2025-11-15",
    title: ["鱿鱼游戏", "イカゲーム"],
    summary: ["分组闯关、选代号、猜卧底，第一次见面也有共同目标。", "チームで挑戦し、初対面でも共通の目的を持てる回です。"],
  },
  {
    id: "bbq-gathering",
    slug: "bbq",
    count: 9, category: "large",
    date: "2025-11-24",
    title: ["台场 BBQ 团建", "台場 BBQ"],
    summary: ["海边、烤肉、聊天，活动后的关系更容易延续。", "海辺でBBQをしながら、活動後もつながりやすい時間です。"],
  },
  {
    id: "kpop-party",
    slug: "kpop",
    count: 1, category: "large",
    date: "2025-12-21",
    title: ["Kpop 睡衣派对", "Kpopパジャマパーティー"],
    summary: ["猜歌、宾果、零食和聊天，给 2025 年收个轻松的尾。", "曲当て、ビンゴ、お菓子と会話で、2025年を締めくくりました。"],
  },
  {
    id: "cat-mouse-game",
    slug: "cat-mouse-game",
    count: 1, category: "large",
    coverLayout: "poster",
    coverWidth: 1079,
    coverHeight: 1440,
    date: "2026-06-13",
    title: ["猫鼠游戏", "猫とネズミゲーム"],
    summary: ["代代木公园里的神秘追捕，坚持到最后的人制胜。", "代々木公園でのミステリアスな追跡ゲーム。最後まで残った人が勝利。"],
  },
  {
    id: "red-packet-luck-battle",
    slug: "red-packet-luck-battle",
    count: 1, category: "large",
    coverLayout: "poster",
    coverWidth: 1587,
    coverHeight: 2245,
    date: "2026-06-20",
    title: ["红包欧皇争夺战", "紅包・豪運王争奪戦"],
    summary: ["与新朋友一起闯关趣味游戏，征揽红包，争做终极欧皇！", "新しい友人と一緒にミニゲームに挑戦し、紅包を集めて究極の豪運王を目指します。"],
  },
  {
    id: "moonlit-wolf-feast",
    slug: "moonlit-wolf-feast",
    count: 1, category: "large",
    coverLayout: "poster",
    coverWidth: 1024,
    coverHeight: 1536,
    date: "2026-05-31",
    title: ["月夜狼宴", "月夜の人狼宴"],
    summary: ["上野御徒町狼人杀。今夜，谎言与推理同时开始，争夺终极狼王。", "上野御徒町での人狼ゲーム。今夜、嘘と推理が同時に始まり、究極の狼王を競います。"],
  },
  {
    id: "fuji-q-adventure",
    slug: "fuji-q-adventure",
    count: 1, category: "large",
    coverLayout: "poster",
    coverWidth: 1079,
    coverHeight: 1527,
    date: "2026-05-23",
    title: ["富士急绝叫冒险日", "富士急絶叫アドベンチャーデー"],
    summary: ["这是一次结合游乐园挑战、团队互动和轻社交的周末特别活动，一起边尖叫边快速拉近距离！", "遊園地チャレンジ、チーム交流、ライトな社交を組み合わせた週末特別企画。叫びながら一気に距離を縮めます。"],
  },
  {
    id: "komatsuzawa-farm",
    slug: "komatsuzawa-farm",
    count: 1, category: "large",
    coverLayout: "poster",
    coverWidth: 1440,
    coverHeight: 2038,
    date: "2026-05-16",
    title: ["小松泽农园团建", "小松沢農園チーム活動"],
    summary: ["城市太吵，农场刚好。这个周末，和竹溪社成员去小松泽农园过一天慢下来的田园生活吧。", "都会の喧騒を離れて農園へ。この週末、竹渓社のメンバーと小松沢農園でゆっくりした田園の一日を過ごします。"],
  },
  {
    id: "shinjuku-gyoen-color-picnic",
    slug: "shinjuku-gyoen-color-picnic",
    count: 1, category: "large",
    coverLayout: "poster",
    coverWidth: 1587,
    coverHeight: 2245,
    date: "2026-04-25",
    title: ["新宿御苑·色彩挑战野餐", "新宿御苑・カラーチャレンジピクニック"],
    summary: ["这是一次结合野餐、游戏和轻社交的户外活动，让大家在春天的草地上轻松认识彼此。", "ピクニック、ゲーム、ライトな交流を組み合わせた屋外企画。春の芝生で気軽にお互いを知れる一日です。"],
  },
  {
    id: "spring-2026-welcome-party",
    slug: "spring-2026-welcome-party",
    count: 1, category: "large",
    coverLayout: "poster",
    coverWidth: 1079,
    coverHeight: 1527,
    date: "2026-04-25",
    title: ["2026春学期迎新轰趴", "2026春学期ウェルカムホームパーティー"],
    summary: ["竹溪社所有玩家26年春学期第一次线下见面的活动，一场让大家轻松相识、自然熟络的聚会。无论你是社交新手还是游戏高手，都能在这里找到同频的伙伴。", "竹渓社メンバーが2026年春学期に初めてオフラインで集まる会。自然に打ち解け、同じ温度感の仲間を見つけられるパーティーです。"],
  },
] as const

export function getLandingEventReviews(locale: string, category = "large"): PastEventReviewPublic[] {
  const index = locale === "ja" ? 1 : 0
  return events.filter((event) => event.category === category).map((event) => {
    const photos = seq(event.slug, event.count)
    const coverMeta = "coverLayout" in event
      ? { cover_layout: event.coverLayout, cover_width: event.coverWidth, cover_height: event.coverHeight }
      : {}
    return {
      id: event.id,
      title: event.title[index],
      summary: event.summary[index],
      event_date: event.date,
      cover_url: photos[0],
      gallery_urls: photos.slice(1),
      source_url: null,
      ...coverMeta,
    }
  })
}

export const getLandingScriptEventReviews = (locale: string): PastEventReviewPublic[] => getLandingEventReviews(locale, "script")
