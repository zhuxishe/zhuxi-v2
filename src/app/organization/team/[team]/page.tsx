import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, UsersRound } from "lucide-react"
import { BambooLeaves } from "@/components/landing/BambooLeaves"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { findDepartment, teamDepartments } from "@/lib/landing-team"

type Props = { params: Promise<{ team: string }> }

export function generateStaticParams() {
  return teamDepartments.map((department) => ({ team: department.slug }))
}

export default async function TeamDetailPage({ params }: Props) {
  const { team } = await params
  const department = findDepartment(team)
  if (!department) notFound()

  return (
    <>
      <BambooLeaves />
      <LandingNav />
      <main className="min-h-screen bg-[#fffdf7] px-5 pb-16 pt-28 text-[#171717] grain-overlay">
        <section className="mx-auto max-w-5xl">
          <Link href="/organization" className="inline-flex items-center gap-2 text-sm font-semibold text-[#5f8549]">
            <ArrowLeft className="size-4" />
            返回团队介绍
          </Link>
          <div className="mt-6 rounded-[2rem] border border-[#e5dfd3] bg-white/92 p-7 shadow-[0_16px_42px_rgba(44,55,35,0.10)] md:p-10">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">
              <UsersRound className="size-4" />
              Team
            </p>
            <h1 className="mt-4 font-display text-5xl font-bold leading-tight md:text-6xl">
              {department.name}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-[1.9] text-[#4c5148]">
              {department.intro}
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {department.members.map((member) => (
              <article key={member.name} className="rounded-[1.5rem] border border-[#e5dfd3] bg-white/92 p-5 shadow-[0_14px_34px_rgba(43,53,35,0.08)]">
                <p className="font-display text-3xl font-bold">{member.name}</p>
                <p className="mt-2 text-sm font-semibold text-[#5f8549]">{member.role}</p>
                <p className="mt-4 text-sm leading-[1.8] text-[#4c5148]">
                  {member.school}
                  <br />
                  {member.major}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <LandingFooter />
    </>
  )
}
