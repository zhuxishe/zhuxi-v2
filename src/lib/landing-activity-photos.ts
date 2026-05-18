import type { PastEventReviewPublic } from "@/lib/queries/past-event-reviews"

const img = (name: string) => `/images/landing/mobile-redesign/${name}`

const reviews = [
  {
    id: "landing-lake-trip",
    title: ["一起出门", "一緒に出かける"],
    summary: ["从合照、散步到路上的聊天，熟起来往往就是一次出门。", "写真、散歩、移動中の会話。仲良くなるきっかけは一回のお出かけです。"],
    event_date: "2026-05",
    cover_url: img("gallery-fireworks.webp"),
    gallery_urls: [img("gallery-walk.webp"), img("gallery-mountain.webp"), img("gallery-park.webp")],
    source_url: null,
  },
  {
    id: "landing-dinner-party",
    title: ["聚餐和闲聊", "食事と会話"],
    summary: ["坐下来吃点东西，再自然地聊几句，新人也能慢慢融入。", "食べながら少し話すだけで、初参加でも入りやすくなります。"],
    event_date: "2026-05",
    cover_url: img("gallery-bbq-wide.webp"),
    gallery_urls: [img("gallery-table.webp"), img("gallery-bbq.webp"), img("gallery-room.webp")],
    source_url: null,
  },
  {
    id: "landing-play-night",
    title: ["桌游和手作", "卓遊と手作り"],
    summary: ["剧本、桌游、手作小局都可以成为认识新朋友的开始。", "シナリオ、卓遊、手作りの小さな回から友だちが増えていきます。"],
    event_date: "2026-05",
    cover_url: img("gallery-craft.webp"),
    gallery_urls: [img("gallery-pavilion.webp"), img("gallery-forest.webp")],
    source_url: null,
  },
]

export function getLandingEventReviews(locale: string): PastEventReviewPublic[] {
  const index = locale === "ja" ? 1 : 0
  return reviews.map(({ title, summary, ...review }) => ({
    ...review,
    title: title[index],
    summary: summary[index],
  }))
}
