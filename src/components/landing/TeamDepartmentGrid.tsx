import Link from "next/link"
import { ArrowRight, Brush, CalendarDays, Code2, PenTool } from "lucide-react"
import { teamDepartments, teamLeads } from "@/lib/landing-team"

const icons = [CalendarDays, PenTool, Brush, Code2] as const

export function TeamDepartmentGrid() {
  return (
    <section className="rounded-[1.8rem] border border-[#e5dfd3] bg-white/92 p-6 shadow-[0_16px_42px_rgba(44,55,35,0.08)] md:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">Team</p>
        <h2 className="mt-2 font-display text-3xl font-bold">团队介绍</h2>
        <p className="mt-3 text-sm leading-[1.9] text-[#4c5148]">
          四个部门一起处理活动、剧本、宣传和技术支持。
        </p>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {teamLeads.map((lead) => (
          <div key={lead.name} className="rounded-2xl bg-[#f7f5ed] p-4">
            <p className="font-display text-xl font-bold">{lead.name}</p>
            <p className="mt-1 text-sm font-semibold text-[#5f8549]">{lead.role}</p>
            <p className="mt-2 text-xs leading-relaxed text-[#4c5148]">{lead.school} · {lead.major}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {teamDepartments.map((department, index) => {
          const Icon = icons[index]
          return (
            <Link
              key={department.slug}
              href={`/organization/team/${department.slug}`}
              className="group rounded-[1.4rem] border border-[#e7e2d7] bg-[#fffdf8] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(43,53,35,0.10)]"
            >
              <span className="mb-4 grid size-11 place-items-center rounded-2xl bg-[#edf4e7] text-[#5f8549]">
                <Icon className="size-6" />
              </span>
              <h3 className="font-display text-xl font-bold">{department.name}</h3>
              <p className="mt-2 min-h-10 text-xs leading-relaxed text-[#4c5148]">{department.intro}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#5f8549]">
                查看成员
                <ArrowRight className="size-3 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
