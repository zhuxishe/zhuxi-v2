"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Check, LoaderCircle } from "lucide-react"
import { BirthdayPicker } from "@/components/player/BirthdayPicker"
import { completeBirthdayAction } from "@/app/app/profile/birthday/actions"
import { ageRangeFromBirthDate, parseBirthDate } from "@/lib/member-master/birth-date"
import type { BirthdayCompletion } from "@/lib/profile/birthday-completion"

export function BirthdayCompletionForm({ initial }: { initial: BirthdayCompletion }) {
  const t = useTranslations("profile.birthdayCompletion")
  const birthdayT = useTranslations("interview")
  const router = useRouter()
  const [birthDate, setBirthDate] = useState("")
  const [saved, setSaved] = useState<BirthdayCompletion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const state = saved ?? initial
  const date = parseBirthDate(state.birth_date)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const result = await completeBirthdayAction(birthDate)
        if (result.error) {
          setError(result.error)
          if (result.error === "alreadySet" || result.error === "notEligible") router.refresh()
          return
        }
        setSaved(result.state)
        router.refresh()
      } catch {
        setError("saveFailed")
      }
    })
  }

  return (
    <>
      <section className="rounded-[22px] border border-border/90 bg-card p-5 shadow-soft">
        {date ? (
          <div role="status" className="space-y-4">
            <div className="flex items-center gap-2 font-semibold text-primary"><Check aria-hidden="true" className="size-5" />{t("completed")}</div>
            <p className="text-sm leading-6 text-muted-foreground">{t("completedHint")}</p>
            <dl className="space-y-3 rounded-xl bg-secondary p-4 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("birthday")}</dt><dd className="tabular-nums">{birthdayT("birthDateValue", date)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("ageRange")}</dt><dd>{ageRangeFromBirthDate(state.birth_date) ?? state.age_range}</dd></div>
            </dl>
          </div>
        ) : state.eligible ? (
          <form onSubmit={submit} className="space-y-5">
            <p className="text-sm leading-6 text-muted-foreground">{t("description")}</p>
            <fieldset disabled={pending} className="space-y-5">
              <BirthdayPicker value={birthDate} onChange={(value) => { setBirthDate(value); setError(null) }} />
              <p className="text-xs leading-5 text-muted-foreground">{t("confirmHint")}</p>
              {error ? <p role="alert" className="text-sm text-destructive">{t(error)}</p> : null}
              <button type="submit" disabled={pending || !birthDate} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:opacity-50">
                {pending ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
                {pending ? t("saving") : t("save")}
              </button>
            </fieldset>
          </form>
        ) : <p className="text-sm leading-6 text-muted-foreground">{t("notEligible")}</p>}
      </section>
      <Link href="/app/profile" className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t("back")}</Link>
    </>
  )
}
