import { requirePlayer } from "@/lib/auth/player"
import { createClient } from "@/lib/supabase/server"
import { getTranslations } from "next-intl/server"
import { LineBindingCard } from "@/components/player/LineBindingCard"
import { signOut } from "@/app/login/actions"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function ProfilePage() {
  const player = await requirePlayer()
  const t = await getTranslations("profile")
  const supabase = await createClient()

  const { data: member } = await supabase
    .from("members")
    .select("line_user_id, email")
    .eq("id", player.memberId)
    .single()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">{t("title")}</h1>

      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-2">
        <p className="text-sm"><span className="text-muted-foreground">{t("name")}:</span> {player.name}</p>
        <p className="text-sm"><span className="text-muted-foreground">{t("email")}:</span> {member?.email ?? "-"}</p>
        <p className="text-sm"><span className="text-muted-foreground">{t("number")}:</span> {player.memberNumber ?? "-"}</p>
      </div>

      <LineBindingCard lineUserId={member?.line_user_id ?? null} />

      <div className="space-y-2">
        <Link href="/app/profile/supplementary" className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 hover:ring-primary/30 transition-all">
          <p className="text-sm font-medium">{t("editSupplementary")}</p>
          <p className="text-xs text-muted-foreground">{t("editSupplementaryHint")}</p>
        </Link>
        <Link href="/app/profile/personality" className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 hover:ring-primary/30 transition-all">
          <p className="text-sm font-medium">{t("editPersonality")}</p>
          <p className="text-xs text-muted-foreground">{t("editPersonalityHint")}</p>
        </Link>
        <Link href="/app/profile/quiz" className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 hover:ring-primary/30 transition-all">
          <p className="text-sm font-medium">社交人格测试</p>
          <p className="text-xs text-muted-foreground">15道情景题，3分钟了解你的社交风格</p>
        </Link>
      </div>

      <form action={signOut}>
        <Button variant="outline" className="w-full text-destructive">{t("logout")}</Button>
      </form>
    </div>
  )
}
