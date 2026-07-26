import { organizationMission } from "@/lib/landing-story"

export function OrganizationMissionCard() {
  return (
    <section
      aria-labelledby="organization-mission-title"
      className="rounded-[1.45rem] border border-[#dce5d0] bg-[#edf4e7] p-5 shadow-[0_16px_42px_rgba(44,55,35,0.08)] md:p-8"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8f4e]">
        Our Mission
      </p>
      <h2 id="organization-mission-title" className="mt-2 font-display text-3xl font-bold">
        我们的使命
      </h2>
      <p className="mt-3 max-w-4xl text-sm font-semibold leading-[1.6] text-[#3f463c] md:text-base">
        {organizationMission}
      </p>
    </section>
  )
}
