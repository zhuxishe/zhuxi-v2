import { getLocale } from "next-intl/server"
import { Leaf, UsersRound } from "lucide-react"

const total = 135
const schools = 29

const segments = [
  { zh: "早稻田大学", ja: "早稲田大学", count: 44, color: "#83a866" },
  { zh: "东京大学", ja: "東京大学", count: 17, color: "#8fbec8" },
  { zh: "法政大学", ja: "法政大学", count: 11, color: "#f0ca67" },
  { zh: "语校", ja: "語学学校", count: 9, color: "#f0a65e" },
  { zh: "东京理科大学", ja: "東京理科大学", count: 8, color: "#78b4db" },
  { zh: "顺天堂大学", ja: "順天堂大学", count: 6, color: "#e9938b" },
  { zh: "东洋大学", ja: "東洋大学", count: 6, color: "#c6a0c8" },
  { zh: "东京科学大学", ja: "東京科学大学", count: 6, color: "#9fb5df" },
  { zh: "其他学校/未填写", ja: "その他/未回答", count: 28, color: "#b8c98b" },
]

function chartGradient() {
  let cursor = 0
  return segments
    .map((item) => {
      const start = cursor
      const end = cursor + (item.count / total) * 100
      cursor = end
      return `${item.color} ${start}% ${end}%`
    })
    .join(", ")
}

export async function SchoolDistributionSection() {
  const ja = (await getLocale()) === "ja"
  const percent = (count: number) => Math.round((count / total) * 100)

  return (
    <section className="relative overflow-hidden bg-[#fffdf7] px-5 pb-16">
      <div className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-[#d7e8c6]/45 blur-3xl" />
      <div className="absolute -right-20 bottom-8 h-52 w-52 rounded-full bg-[#f4df8c]/25 blur-3xl" />
      <div className="relative mx-auto max-w-5xl rounded-[1.6rem] border border-[#e7e2d7] bg-white/88 p-5 shadow-[0_18px_50px_rgba(43,53,35,0.10)] md:p-8">
        <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#cbdcb9] bg-[#f9fbf3] px-4 py-2 text-sm font-semibold text-[#5d8b43]">
              <Leaf className="size-4" />
              {ja ? `${schools}校から` : `来自 ${schools} 所学校`}
            </div>
            <h2 className="mt-5 font-display text-4xl font-bold tracking-[0.08em] text-[#171717] md:text-5xl">
              {ja ? "メンバーの学校分布" : "社员学校分布"}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#4c5147]">
              {ja
                ? "早稲田の学生が多めですが、東京周辺のいろいろな学校から参加しています。"
                : "早稻田的同学最多，但成员来自东京周边不同学校，更容易遇见同校和同频的人。"}
            </p>
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#eef6e7] p-4 text-[#496d39]">
              <UsersRound className="size-7 shrink-0" />
              <p className="text-sm font-semibold">
                {ja ? `${total}名のメンバー統計` : `${total} 位社员统计`}
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-[240px_1fr] sm:items-center">
            <div className="relative mx-auto grid size-60 place-items-center rounded-full shadow-inner" style={{ background: `conic-gradient(${chartGradient()})` }}>
              <div className="grid size-28 place-items-center rounded-full bg-[#fffdf7] text-center shadow-[inset_0_0_0_1px_rgba(93,139,67,0.12)]">
                <span className="font-display text-3xl font-bold text-[#171717]">
                  {schools}
                </span>
                <span className="text-xs font-semibold text-[#5d8b43]">
                  {ja ? "学校" : "所学校"}
                </span>
              </div>
            </div>
            <div className="grid gap-2">
              {segments.map((item) => (
                <div key={item.zh} className="flex items-center justify-between gap-3 rounded-xl bg-[#faf8f0] px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate font-semibold">{ja ? item.ja : item.zh}</span>
                  </span>
                  <span className="shrink-0 text-[#5d8b43]">
                    {item.count}{ja ? "名" : "人"} · {percent(item.count)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
