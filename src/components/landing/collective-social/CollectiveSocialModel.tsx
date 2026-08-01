import { Fragment } from "react"
import { ArrowRight, Flag, Sprout, UsersRound } from "lucide-react"
import { getTranslations } from "next-intl/server"

const steps = [
  { title: "step1Title", body: "step1Body", number: "01", Icon: UsersRound },
  { title: "step2Title", body: "step2Body", number: "02", Icon: Flag },
  { title: "step3Title", body: "step3Body", number: "03", Icon: Sprout },
] as const

export async function CollectiveSocialModel() {
  const t = await getTranslations("collectiveSocial")

  return (
    <section className="border-y border-[#e3ddcf] bg-[#f4f1e7] px-5 py-20 sm:px-8 md:py-24" aria-labelledby="class-model-title">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4f6843]">{t("modelEyebrow")}</p>
        <div className="mt-4 grid gap-5 md:grid-cols-[0.8fr_1.2fr] md:items-end">
          <h2 id="class-model-title" className="font-display text-3xl font-bold tracking-[0.05em] text-[#1d291b] sm:text-4xl">{t("modelTitle")}</h2>
          <p className="max-w-2xl text-sm leading-[1.85] text-[#62685d] md:justify-self-end md:text-base">{t("modelBody")}</p>
        </div>
        <ol className="mt-12 grid items-center gap-5 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {steps.map(({ title, body, number, Icon }, index) => (
            <Fragment key={number}>
              <li className="relative flex min-h-64 flex-col items-center justify-center rounded-[2.75rem] border border-[#d9d2c4] bg-[#fffdf8] px-7 py-10 text-center">
                <span className="absolute -top-4 grid size-9 place-items-center rounded-full bg-[#4f6843] font-display text-sm font-bold text-white">{number}</span>
                <h3 className="font-display text-2xl font-semibold text-[#21301f]">{t(title)}</h3>
                <p className="mt-4 text-sm leading-[1.9] text-[#596052]">{t(body)}</p>
                <Icon className="mt-7 size-8 text-[#5f8549]" strokeWidth={1.5} />
              </li>
              {index < steps.length - 1 ? (
                <li role="presentation" className="hidden text-[#8ea380] md:block">
                  <ArrowRight className="size-5" aria-hidden="true" />
                </li>
              ) : null}
            </Fragment>
          ))}
        </ol>
      </div>
    </section>
  )
}
