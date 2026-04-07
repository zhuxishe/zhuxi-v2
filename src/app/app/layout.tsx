import { requireAuth } from "@/lib/auth/player"
import { PlayerBottomNav } from "@/components/player/PlayerBottomNav"

export default async function PlayerAppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth()

  return (
    <div className="flex min-h-screen flex-col bg-background pb-16">
      <main className="mx-auto w-full max-w-md flex-1">{children}</main>
      <PlayerBottomNav playerName="" />
    </div>
  )
}
