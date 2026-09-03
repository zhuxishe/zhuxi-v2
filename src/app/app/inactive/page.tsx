import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ShieldAlert } from "lucide-react"
import { getPlayerInfo } from "@/lib/auth/player"
import { HomeLink } from "@/components/auth/HomeLink"

export default async function InactivePlayerPage() {
  const player = await getPlayerInfo()
  if (!player) redirect("/login")

  const blocked =
    player.status === "inactive" ||
    player.accountStatus === "suspended" ||
    player.accountStatus === "closed" ||
    player.accountStatus !== "active" ||
    (player.status === "approved" && player.membershipType !== "player")

  if (!blocked) redirect("/app")

  const t = await getTranslations("inactive")

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-sm space-y-4 text-center">
        <ShieldAlert className="mx-auto size-12 text-destructive" />
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <div className="pt-2">
          <HomeLink />
        </div>
      </div>
    </div>
  )
}
