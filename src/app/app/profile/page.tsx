import { requirePlayer } from "@/lib/auth/player"
import { createClient } from "@/lib/supabase/server"
import { getTranslations } from "next-intl/server"
import { LineBindingCard } from "@/components/player/LineBindingCard"
import { signOut } from "@/app/login/actions"
import { Button } from "@/components/ui/button"
import { LocaleSwitcher } from "@/components/LocaleSwitcher"
import Link from "next/link"

export default async function ProfilePage() {
  const player = await requirePlayer()
  const t = await getTranslations("profile")
  const tQuiz = await getTranslations("quiz")
  const supabase = await createClient()

  const { data: member } = await supabase
    .from("members")
    .select("line_user_id, email")
    .eq("id", player.memberId)
    .single()

  return (
    <div className="p-6 space-y-4">
      <h1 className="heading-display text-2xl">{t("title")}</h1>

      <div className="rounded-xl bg-card p-4 shadow-soft space-y-2">
        <p className="text-sm"><span className="text-muted-foreground">{t("name")}:</span> {player.name}</p>
        <p className="text-sm"><span className="text-muted-foreground">{t("email")}:</span> {member?.email ?? "-"}</p>
        <p className="text-sm"><span className="text-muted-foreground">{t("number")}:</span> {player.memberNumber ?? "-"}</p>
      </div>

      <LineBindingCard lineUserId={member?.line_user_id ?? null} />

      <div className="space-y-2">
        <Link href="/app/profile/supplementary" className="group block rounded-xl bg-card p-4 shadow-soft hover:shadow-soft-lg transition-all">
          <p className="text-sm font-medium">{t("editSupplementary")}</p>
          <p className="text-xs text-muted-foreground">{t("editSupplementaryHint")}</p>
        </Link>
        <Link href="/app/profile/personality" className="group block rounded-xl bg-card p-4 shadow-soft hover:shadow-soft-lg transition-all">
          <p className="text-sm font-medium">{t("editPersonality")}</p>
          <p className="text-xs text-muted-foreground">{t("editPersonalityHint")}</p>
        </Link>
        <Link href="/app/profile/quiz" className="group block rounded-xl bg-card p-4 shadow-soft hover:shadow-soft-lg transition-all">
          <p className="text-sm font-medium">{tQuiz("profileTitle")}</p>
          <p className="text-xs text-muted-foreground">{tQuiz("profileHint")}</p>
        </Link>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-card p-4 shadow-soft">
        <span className="text-sm font-medium">{t("language")}</span>
        <LocaleSwitcher />
      </div>

      <form action={signOut}>
        <Button variant="outline" className="w-full text-destructive">{t("logout")}</Button>
      </form>
    </div>
  )
}
