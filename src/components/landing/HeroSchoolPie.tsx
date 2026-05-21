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

export function HeroSchoolPie({ ja }: { ja: boolean }) {
  return (
    <div className="rounded-[1.25rem] border border-white/55 bg-white/78 p-3.5 shadow-[0_12px_30px_rgba(43,53,35,0.12)] backdrop-blur-md md:p-4">
      <div className="grid grid-cols-[5.9rem_1fr] items-center gap-3 md:grid-cols-[7rem_1fr] md:gap-5">
        <div className="relative mx-auto grid size-[5.35rem] place-items-center rounded-full md:size-28" style={{ background: `conic-gradient(${chartGradient()})` }}>
          <div className="grid size-[3.45rem] place-items-center rounded-full bg-[#fffdf7] text-center shadow-inner md:size-[4.2rem]">
            <span className="font-display text-2xl font-bold leading-none text-[#171717] md:text-2xl">{schools}</span>
            <span className="-mt-1 text-[10px] font-semibold text-[#5f8549]">{ja ? "校" : "所"}</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-[#5f8549]">
            <span>{ja ? "学校分布" : "社员学校分布"}</span>
            <span>{total}{ja ? "名" : "人"}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px] md:grid-cols-3 md:text-xs">
            {items.map((item) => (
              <div key={item.zh} className="flex min-w-0 items-center justify-between gap-1.5 rounded-full bg-[#fffdf7]/85 px-2 py-1 font-semibold text-[#343a30]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="truncate">{ja ? item.ja : item.zh}</span>
                </span>
                <span className="shrink-0 text-[#6b8f4e]">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
