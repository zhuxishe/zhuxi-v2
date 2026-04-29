import { getTranslations } from "next-intl/server"

export async function FounderSection() {
  const t = await getTranslations("organization")

  return (
    <section className="container mx-auto mt-8 max-w-5xl">
      <article className="rounded-[2rem] border border-[#ded5c5] bg-white/82 p-7 shadow-[0_16px_44px_rgba(35,27,16,0.07)] md:p-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex size-24 shrink-0 items-center justify-center rounded-full bg-[#f4eee4] font-display text-4xl font-bold text-bamboo">
            陈
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-bamboo">
              {t("founderKicker")}
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold leading-tight text-[#13241d]">
              {t("founderName")}
            </h2>
            <p className="mt-2 text-sm font-medium text-[#9b5a4c]">
              {t("founderSchool")}
            </p>
            <p className="mt-5 text-sm leading-[1.9] text-muted-foreground md:text-base">
              {t("founderIntro")}
            </p>
          </div>
        </div>
      </article>
    </section>
  )
}
