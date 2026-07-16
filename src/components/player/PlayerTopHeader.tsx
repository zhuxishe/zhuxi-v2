import Image from "next/image"
import Link from "next/link"
import { HOME_SKIP_INTRO_HREF } from "@/lib/landing-intro"
import { NotificationBell } from "@/components/player/NotificationBell"
import type { CommunityNotification } from "@/lib/community/types"

interface PlayerTopHeaderProps {
  notifications?: CommunityNotification[]
  unreadCount?: number
  locale?: string
  showNotifications?: boolean
}

export function PlayerTopHeader({
  notifications = [],
  unreadCount = 0,
  locale = "zh",
  showNotifications = false,
}: PlayerTopHeaderProps) {
  return (
    <header className="player-top-header sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-md items-center px-4">
        <Link href={HOME_SKIP_INTRO_HREF} className="inline-flex items-center gap-2 text-primary transition-opacity hover:opacity-80">
          <Image src="/logo.svg" alt="" width={28} height={28} className="size-7" priority />
          <span className="heading-display text-base font-semibold leading-none">竹溪社</span>
        </Link>
        {showNotifications && (
          <NotificationBell items={notifications} unreadCount={unreadCount} locale={locale} />
        )}
      </div>
    </header>
  )
}
