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
  { zh: "其他", ja: "その他", count: 46, color: "#b8c98b" },
]

function chartGradient() {
  let cursor = 0
  return segments.map((item) => {
    const start = cursor
    const end = cursor + (item.count / total) * 100
    cursor = end
    return `${item.color} ${start}% ${end}%`
  }).join(", ")
}

export async function SchoolDistributionSection() {
  const ja = (await getLocale()) === "ja"

  return (
    <section className="relative bg-[#fffdf7] px-5 pb-12">
      <div className="mx-auto max-w-5xl rounded-[1.4rem] border border-[#e7e2d7] bg-white/90 p-4 shadow-[0_14px_34px_rgba(43,53,35,0.09)] md:p-6">
        <div className="grid gap-5 md:grid-cols-[0.85fr_1.15fr] md:items-center">
          <div className="flex items-center gap-4">
            <div className="relative grid size-32 shrink-0 place-items-center rounded-full shadow-inner md:size-40" style={{ background: `conic-gradient(${chartGradient()})` }}>
              <div className="grid size-16 place-items-center rounded-full bg-[#fffdf7] text-center md:size-20">
                <span className="font-display text-2xl font-bold text-[#171717]">{schools}</span>
                <span className="text-[11px] font-semibold text-[#5d8b43]">{ja ? "学校" : "所学校"}</span>
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#edf4e7] px-3 py-1.5 text-xs font-semibold text-[#5d8b43]">
                <Leaf className="size-3.5" />
                {ja ? `${total}名の統計` : `${total} 位成员统计`}
              </div>
              <h2 className="mt-3 font-display text-2xl font-bold tracking-[0.06em] md:text-4xl">
                {ja ? "学校分布" : "成员学校分布"}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-[#4c5147] md:text-sm">
                {ja ? "東京周辺のさまざまな学校から参加しています。" : "来自东京周边不同学校，遇见同校和同频的人。"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {segments.map((item) => (
              <div key={item.zh} className="rounded-xl bg-[#faf8f0] px-3 py-2 text-xs">
                <span className="flex items-center gap-2 font-semibold">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  {ja ? item.ja : item.zh}
                </span>
                <span className="mt-1 inline-flex items-center gap-1 text-[#5d8b43]">
                  <UsersRound className="size-3" />
                  {item.count}{ja ? "名" : "人"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
