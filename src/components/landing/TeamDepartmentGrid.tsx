import { teamDepartments, teamLeads } from "@/lib/landing-team"

const members = [
  ...teamLeads,
  ...teamDepartments.flatMap((department) => department.members),
]

export function TeamDepartmentGrid() {
  return (
    <section className="rounded-[1.45rem] border border-[#e5dfd3] bg-white/92 p-5 shadow-[0_16px_42px_rgba(44,55,35,0.08)] md:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">Team</p>
        <h2 className="mt-2 font-display text-3xl font-bold">团队介绍</h2>
        <p className="mt-3 text-sm leading-[1.9] text-[#4c5148]">
          Stuff在读于东京各大校园，我们秉持着同样的理念与价值观，努力让人与人之间的联结变得更加通畅。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => (
          <div key={`${member.name}-${member.role}`} className="rounded-2xl bg-[#f7f5ed] p-4">
            <p className="font-display text-xl font-bold">{member.name}</p>
            <p className="mt-1 text-sm font-semibold text-[#5f8549]">{member.role}</p>
            <p className="mt-2 text-xs leading-relaxed text-[#4c5148]">{member.school} · {member.major}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
