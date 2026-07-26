import { organizationMission } from "@/lib/landing-story"

export function OrganizationMissionCard() {
  return (
    <section
      aria-labelledby="organization-mission-title"
      className="rounded-[1.45rem] border border-[#dce5d0] bg-[#edf4e7] px-5 py-6 shadow-[0_16px_42px_rgba(44,55,35,0.08)] md:px-8 md:py-7"
    >
      <div className="flex gap-4 md:items-center">
        <span
          aria-hidden="true"
          className="mt-1 h-12 w-1 shrink-0 rounded-full bg-[#f3cf55] md:mt-0"
        />
        <div>
          <h2
            id="organization-mission-title"
            className="font-display text-xl font-bold leading-tight tracking-[0.02em] text-[#253320] md:text-2xl"
          >
            Our Mission 我们的使命
          </h2>
          <p className="mt-3 max-w-4xl text-base font-semibold leading-[1.8] text-[#3f463c] md:text-lg">
            {organizationMission}
          </p>
        </div>
      </div>
    </section>
  )
}
