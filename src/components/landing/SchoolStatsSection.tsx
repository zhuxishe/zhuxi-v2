import { getLocale } from "next-intl/server"
import { School, UsersRound } from "lucide-react"
import type { ReactNode } from "react"

const total = 135
const schools = 29
const items = [
  { zh: "早稻田", ja: "早稲田", count: 44, color: "#7fa862" },
  { zh: "东大", ja: "東大", count: 17, color: "#86bdc8" },
  { zh: "法政", ja: "法政", count: 11, color: "#f1ca66" },
  { zh: "语校", ja: "語学", count: 9, color: "#efa65d" },
  { zh: "理科", ja: "理科", count: 8, color: "#78b4db" },
  { zh: "其他", ja: "その他", count: 46, color: "#b7c987" },
] as const

export async function SchoolStatsSection() {
  const ja = (await getLocale()) === "ja"

  return (
    <section className="bg-[#fffdf7] px-5 pb-16 pt-8 text-[#171717] grain-overlay">
      <div className="mx-auto max-w-5xl rounded-[1.6rem] border border-[#e5dfd3] bg-white/82 p-5 shadow-[0_18px_48px_rgba(43,53,35,0.10)] backdrop-blur md:p-8">
        <div className="grid gap-5 md:grid-cols-[0.9fr_1.6fr] md:items-end">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-[#6b8f4e]">
              {ja ? "MEMBER DATA" : "社员学校分布"}
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold md:text-5xl">
              {ja ? "学校とメンバー" : "来自不同学校的人"}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<School className="size-5" />} value={schools} label={ja ? "校" : "所学校"} />
            <StatCard icon={<UsersRound className="size-5" />} value={total} label={ja ? "名" : "位成员"} />
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-full border border-[#e2dccf] bg-[#f5f0e5] p-1">
          <div className="flex h-5 overflow-hidden rounded-full">
            {items.map((item) => (
              <span key={item.zh} style={{ width: `${(item.count / total) * 100}%`, backgroundColor: item.color }} />
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
          {items.map((item) => (
            <div key={item.zh} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fffdf7] px-3 py-2 font-semibold">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {ja ? item.ja : item.zh}
              </span>
              <span className="font-display text-lg text-[#5f8549]">{item.count}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function StatCard({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-[#e8e0d2] bg-[#fffdf7] p-4">
      <span className="mb-2 grid size-9 place-items-center rounded-full bg-[#e6f0db] text-[#5f8549]">{icon}</span>
      <p className="font-display text-4xl font-bold text-[#5f8549]">{value}</p>
      <p className="text-sm font-semibold text-[#4d5548]">{label}</p>
    </div>
  )
}
