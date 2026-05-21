import { getLocale } from "next-intl/server"
import { GraduationCap, UsersRound } from "lucide-react"

const total = 135
const schools = 29
const schoolsData = [
  { zh: "早稻田大学", ja: "早稲田大学", count: 44, color: "#83a866" },
  { zh: "东京大学", ja: "東京大学", count: 17, color: "#8fbec8" },
  { zh: "法政大学", ja: "法政大学", count: 11, color: "#f0ca67" },
  { zh: "语校", ja: "語学学校", count: 9, color: "#f0a65e" },
  { zh: "东京理科大学", ja: "東京理科大学", count: 8, color: "#78b4db" },
  { zh: "其他", ja: "その他", count: 46, color: "#b8c98b" },
]

export async function SchoolDistributionSection() {
  const ja = (await getLocale()) === "ja"

  return (
    <section className="relative bg-[#fffdf7] px-5 pb-12">
      <div className="mx-auto max-w-5xl rounded-[1.8rem] border border-[#e7e2d7] bg-[#fffef9] p-4 shadow-[0_16px_40px_rgba(43,53,35,0.09)] md:p-7">
        <div className="grid gap-4 md:grid-cols-[0.78fr_1.22fr] md:items-stretch">
          <div className="relative overflow-hidden rounded-[1.4rem] bg-[#5f8549] p-6 text-white">
            <div className="absolute -right-8 -top-8 size-28 rounded-full border border-white/20" />
            <div className="absolute -bottom-10 left-8 size-32 rounded-full bg-white/10" />
            <GraduationCap className="relative size-8 opacity-90" />
            <p className="relative mt-8 font-display text-7xl font-bold leading-none">{schools}</p>
            <p className="relative mt-2 text-sm font-semibold tracking-[0.24em]">
              {ja ? "所属校" : "所学校"}
            </p>
            <div className="relative mt-7 rounded-2xl bg-white/13 p-4">
              <p className="text-3xl font-bold">{total}</p>
              <p className="mt-1 text-xs font-semibold text-white/78">
                {ja ? "名のメンバー統計" : "位成员统计"}
              </p>
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-[#e8e1d2] bg-white/78 p-5 md:p-6">
            <p className="text-xs font-semibold tracking-[0.2em] text-[#6b8f4e]">
              SCHOOL MAP
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-[0.03em] md:text-4xl">
              {ja ? "学校分布" : "成员学校分布"}
            </h2>
            <p className="mt-3 text-sm leading-[1.8] text-[#4c5147]">
              {ja ? "東京周辺の学校から参加しています。" : "来自东京周边不同学校，活动里自然坐到一起。"}
            </p>
            <div className="mt-5 space-y-3">
              {schoolsData.map((item) => (
                <div key={item.zh}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-semibold">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {ja ? item.ja : item.zh}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[#5d8b43]">
                      <UsersRound className="size-3" />
                      {item.count}{ja ? "名" : "人"}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#f0ede3]">
                    <div className="h-full rounded-full" style={{ width: `${(item.count / total) * 100}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
