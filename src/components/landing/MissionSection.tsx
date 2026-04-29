import { getTranslations } from "next-intl/server"

const FLOW_GROUPS = [
  { key: "Join", count: 2 },
  { key: "Activity", count: 5 },
] as const

export async function MissionSection() {
  const t = await getTranslations("home")

  return (
    <section id="join" className="relative bg-[#f2f0eb] px-5 py-16 md:py-24">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-10 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bamboo">
            {t("missionKicker")}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight md:text-5xl">
            {t("missionTitle")}
          </h2>
          <p className="mt-4 text-sm leading-[1.85] text-muted-foreground md:text-base">
            {t("missionSubtitle")}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {FLOW_GROUPS.map((group) => (
            <div key={group.key} className="landing-card bg-white p-6 sm:p-8">
              <h3 className="font-display text-2xl font-semibold leading-tight text-[#13241d]">
                {t(`mission${group.key}Title`)}
              </h3>
              <div className="mt-6 space-y-4">
                {Array.from({ length: group.count }, (_, index) => {
                  const n = index + 1
                  return (
                    <div key={n} className="flex gap-4 border-t border-[#e5ddcf] pt-4 first:border-t-0 first:pt-0">
                      <span className="font-display text-xl font-bold leading-none text-bamboo">
                        {String(n).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="text-sm font-semibold leading-snug text-[#13241d]">
                          {t(`mission${group.key}${n}Title`)}
                        </p>
                        <p className="mt-2 text-sm leading-[1.8] text-muted-foreground">
                          {t(`mission${group.key}${n}Desc`)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
