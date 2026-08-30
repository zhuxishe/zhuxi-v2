import { getLocale } from "next-intl/server"
import { requireMemberRecord } from "@/lib/auth/player"
import { getCommunityContext } from "@/lib/auth/community"
import { fetchCommunityNotifications } from "@/lib/community/queries/notifications"
import { normalizeCommunityLocale } from "@/lib/community/localize"
import { PlayerAppShell } from "@/components/player/PlayerAppShell"

export default async function PlayerAppLayout({ children }: { children: React.ReactNode }) {
  // This is the callback-independent safety net: every authenticated /app
  // entry idempotently ensures its canonical member lifecycle. Active rows are
  // re-read in full; blocked rows route from the RLS-safe ensure envelope.
  const [player, locale] = await Promise.all([requireMemberRecord(), getLocale()])
  let notificationData = { items: [], unreadCount: 0 } as Awaited<ReturnType<typeof fetchCommunityNotifications>>
  let showNotifications = false

  if (
    player.status === "approved" &&
    player.accountStatus === "active"
  ) {
    try {
      await getCommunityContext(player)
      showNotifications = true
      notificationData = await fetchCommunityNotifications(
        player.memberId,
        normalizeCommunityLocale(locale),
        { limit: 8 },
      )
    } catch (error) {
      // The Player App must remain usable while a new community migration is
      // waiting to be applied in Preview.
      console.warn("[community notifications unavailable]", error)
    }
  }

  return (
    <PlayerAppShell
      notifications={notificationData.items}
      unreadCount={notificationData.unreadCount}
      locale={locale}
      showNotifications={showNotifications}
    >
      {children}
    </PlayerAppShell>
  )
}
