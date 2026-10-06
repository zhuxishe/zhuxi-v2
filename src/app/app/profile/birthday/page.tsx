import { getTranslations } from "next-intl/server"
import { requirePlayer } from "@/lib/auth/player"
import { fetchMyBirthdayCompletion } from "@/lib/profile/birthday-completion"
import { BirthdayCompletionForm } from "@/components/player/profile/BirthdayCompletionForm"

export default async function BirthdayCompletionPage() {
  await requirePlayer()
  const [initial, t] = await Promise.all([
    fetchMyBirthdayCompletion(),
    getTranslations("profile.birthdayCompletion"),
  ])
  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <BirthdayCompletionForm initial={initial} />
    </div>
  )
}
