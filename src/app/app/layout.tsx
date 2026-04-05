import { requirePlayer } from "@/lib/auth/player"
import { PlayerBottomNav } from "@/components/player/PlayerBottomNav"

export default async function PlayerAppLayout({ children }: { children: React.ReactNode }) {
  const player = await requirePlayer()

  return (
    <div className="flex min-h-screen flex-col bg-background pb-16">
      <main className="flex-1">{children}</main>
      <PlayerBottomNav playerName={player.name} />
    </div>
  )
}
