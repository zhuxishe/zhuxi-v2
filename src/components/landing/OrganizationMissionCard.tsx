import { organizationMission } from "@/lib/landing-story"

export function OrganizationMissionCard() {
  return (
    <section
      aria-labelledby="organization-mission-title"
      className="rounded-[1.45rem] border border-[#e5dfd3] bg-white/92 px-4 pb-5 pt-3.5 shadow-[0_16px_42px_rgba(44,55,35,0.08)] md:p-8"
    >
      <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-[#6b8f4e] md:text-xs md:leading-normal md:tracking-[0.18em]">
        Our Mission
      </p>
      <h2 id="organization-mission-title" className="mt-0.5 font-display text-[1.375rem] font-bold leading-[1.18] md:mt-2 md:text-3xl md:leading-[1.2]">
        我们的使命
      </h2>
      <p className="mt-3 max-w-4xl text-sm font-normal leading-[1.55] text-[#4c5148] md:text-base md:leading-[1.6]">
        {organizationMission}
      </p>
    </section>
  )
}
