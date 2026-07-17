"use client"

import { usePathname } from "next/navigation"
import { AppLaunchSplash } from "@/components/player/AppLaunchSplash"
import { PlayerBottomNav } from "@/components/player/PlayerBottomNav"
import { PlayerTopHeader } from "@/components/player/PlayerTopHeader"
import type { CommunityNotification } from "@/lib/community/types"

interface PlayerAppShellProps {
  children: React.ReactNode
  notifications: CommunityNotification[]
  unreadCount: number
  locale: string
  showNotifications: boolean
}

function isFocusedComposer(pathname: string) {
  return pathname === "/app/profile/edit"
    || pathname === "/app/community/treehole/new"
    || pathname === "/app/community/photos/new"
    || /^\/app\/community\/(treehole|photos)\/[^/]+\/edit$/.test(pathname)
}

export function PlayerAppShell({
  children,
  notifications,
  unreadCount,
  locale,
  showNotifications,
}: PlayerAppShellProps) {
  const pathname = usePathname()
  const focused = isFocusedComposer(pathname)

  return (
    <div className={focused
      ? "player-app-theme min-h-screen bg-background"
      : "player-app-theme flex min-h-screen flex-col bg-background pb-[calc(5rem+env(safe-area-inset-bottom))]"
    }>
      {!focused && (
        <PlayerTopHeader
          notifications={showNotifications ? notifications : []}
          unreadCount={showNotifications ? unreadCount : 0}
          locale={locale}
          showNotifications={showNotifications}
        />
      )}
      <main className="mx-auto w-full max-w-md flex-1">{children}</main>
      {!focused && <PlayerBottomNav playerName="" />}
      <AppLaunchSplash />
    </div>
  )
}
