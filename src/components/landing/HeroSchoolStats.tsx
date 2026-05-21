import { UsersRound } from "lucide-react"

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

function chartGradient() {
  let cursor = 0
  return items.map((item) => {
    const start = cursor
    const end = cursor + (item.count / total) * 100
    cursor = end
    return `${item.color} ${start}% ${end}%`
  }).join(", ")
}

export function HeroSchoolStats({ ja }: { ja: boolean }) {
  return (
    <div className="rounded-[1.2rem] border border-white/55 bg-white/70 p-3 shadow-[0_12px_34px_rgba(43,53,35,0.12)] backdrop-blur-md md:p-4">
      <div className="grid grid-cols-[6.4rem_1fr] items-center gap-3 md:grid-cols-[8rem_1fr]">
        <div>
          <div className="relative h-14 overflow-hidden md:h-16">
            <div className="absolute left-1/2 top-0 size-28 -translate-x-1/2 rounded-full md:size-32" style={{ background: `conic-gradient(${chartGradient()})` }} />
            <div className="absolute left-1/2 top-8 grid size-14 -translate-x-1/2 place-items-center rounded-full bg-[#fffdf7] text-center shadow-inner md:top-9 md:size-16">
              <span className="font-display text-xl font-bold leading-none">{schools}</span>
              <span className="text-[10px] font-semibold text-[#5f8549]">{ja ? "校" : "所"}</span>
            </div>
          </div>
          <p className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-[#5f8549]">
            <UsersRound className="size-3.5" />
            {total}{ja ? "名" : "人"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px] md:grid-cols-3 md:text-xs">
          {items.map((item) => (
            <div key={item.zh} className="flex items-center gap-1.5 rounded-full bg-[#fffdf7]/80 px-2 py-1 font-semibold text-[#343a30]">
              <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{ja ? item.ja : item.zh}</span>
              <span className="text-[#6b8f4e]">{item.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
