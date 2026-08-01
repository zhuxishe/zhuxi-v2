import { Fragment } from "react"
import { ArrowRight, Flag, RefreshCw, Sprout, UsersRound } from "lucide-react"
import { getTranslations } from "next-intl/server"

const steps = [
  { title: "step1Title", body: "step1Body", number: "01", Icon: UsersRound },
  { title: "step2Title", body: "step2Body", number: "02", Icon: Flag },
  { title: "step3Title", body: "step3Body", number: "03", Icon: Sprout },
  { title: "step4Title", body: "step4Body", number: "04", Icon: RefreshCw },
] as const

export async function CollectiveSocialModel() {
  const t = await getTranslations("collectiveSocial")

  return (
    <section className="border-y border-[#e3ddcf] bg-[#f4f1e7] px-5 py-14 sm:px-8 sm:py-20 md:py-24" aria-labelledby="class-model-title">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#4f6843]">{t("modelEyebrow")}</p>
        <h2 id="class-model-title" className="mt-4 font-display text-2xl font-bold leading-tight tracking-[0.03em] text-[#1d291b] min-[360px]:text-[1.75rem] min-[360px]:tracking-[0.05em] sm:text-4xl">{t("modelTitle")}</h2>
        <ol className="mt-9 grid items-center gap-3 sm:gap-4 md:grid-cols-2 md:gap-6 lg:mt-12 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:gap-4">
          {steps.map(({ title, body, number, Icon }, index) => (
            <Fragment key={number}>
              <li className="relative grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2 rounded-[1.5rem] border border-[#d9d2c4] bg-[#fffdf8] p-5 text-left md:flex md:min-h-56 md:flex-col md:items-center md:justify-center md:rounded-[2rem] md:px-5 md:py-9 md:text-center lg:min-h-60">
                <span className="col-start-1 row-start-1 grid size-10 place-items-center rounded-full bg-[#4f6843] font-display text-sm font-bold text-white md:absolute md:-top-4 md:left-1/2 md:size-9 md:-translate-x-1/2">{number}</span>
                <div className="col-start-2 row-span-2 row-start-1 min-w-0">
                  <h3 className="font-display text-xl font-semibold leading-tight text-[#21301f] md:text-2xl">{t(title)}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-[1.7] text-[#596052] md:mt-4 md:text-sm md:leading-[1.8]">{t(body)}</p>
                </div>
                <Icon className="col-start-1 row-start-2 size-6 self-end text-[#5f8549] md:mt-6 md:size-7 md:self-auto" strokeWidth={1.5} />
              </li>
              {index < steps.length - 1 ? (
                <li role="presentation" className="hidden text-[#8ea380] lg:block">
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
