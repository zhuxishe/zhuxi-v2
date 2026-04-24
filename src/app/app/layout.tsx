import { requireAuth } from "@/lib/auth/player"
import { PlayerBottomNav } from "@/components/player/PlayerBottomNav"
import { PlayerTopHeader } from "@/components/player/PlayerTopHeader"
import { AppLaunchSplash } from "@/components/player/AppLaunchSplash"

export default async function PlayerAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth()

  return (
    <div className="flex min-h-screen flex-col bg-background pb-16">
      <PlayerTopHeader />
      <main className="mx-auto w-full max-w-md flex-1">{children}</main>
      <PlayerBottomNav playerName="" />
      <AppLaunchSplash />
    </div>
  )
}
