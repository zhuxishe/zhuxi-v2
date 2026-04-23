import { getTranslations } from "next-intl/server"

const STATS = [
  { valueKey: "proofMembersValue", labelKey: "proofMembers" },
  { valueKey: "proofSchoolsValue", labelKey: "proofSchools" },
  { valueKey: "proofGroupSizeValue", labelKey: "proofGroupSize" },
  { valueKey: "proofMatchWindowValue", labelKey: "proofMatchWindow" },
] as const

export async function CommunityProofSection() {
  const t = await getTranslations("home")

  return (
    <section className="relative bg-[#1E3932] px-5 py-14 text-white md:py-16">
      <div className="container mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.85fr_1.15fr] md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
            {t("proofKicker")}
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight md:text-4xl">
            {t("proofTitle")}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/68 md:text-base">
            {t("proofSubtitle")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {STATS.map((stat) => (
            <div
              key={stat.labelKey}
              className="rounded-[1.5rem] border border-white/12 bg-white/10 p-5 shadow-[0_8px_24px_rgba(0,0,0,0.14)] backdrop-blur"
            >
              <p className="font-display text-3xl font-bold leading-none md:text-4xl">
                {t(stat.valueKey)}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-white/62">
                {t(stat.labelKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
