"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
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
  const pathname = usePathname()
  const router = useRouter()
  const isHome = pathname === "/app" || pathname === "/app/"
  const isJa = locale.startsWith("ja")
  const brandClassName = "inline-flex items-center gap-2 rounded-sm text-primary transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
  const brand = <>
    <Image src="/logo.svg" alt="" width={28} height={28} className="size-7" priority />
    <span className="heading-display text-base font-semibold leading-none">竹溪社</span>
  </>

  return (
    <header className="player-top-header sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-md items-center px-4">
        {isHome ? (
          <Dialog>
            <DialogTrigger className={brandClassName}>{brand}</DialogTrigger>
            <DialogContent showCloseButton={false}>
              <DialogTitle>{isJa ? "公式サイトに戻りますか？" : "是否返回官网？"}</DialogTitle>
              <DialogDescription>
                {isJa ? "会員ページを離れ、竹溪社の公式サイトに移動します。" : "即将离开交互工具，前往竹溪社官网。"}
              </DialogDescription>
              <div className="grid grid-cols-2 gap-3">
                <DialogClose render={<Button variant="outline" />}>
                  {isJa ? "キャンセル" : "取消"}
                </DialogClose>
                <DialogClose render={<Button onClick={() => router.push(HOME_SKIP_INTRO_HREF)} />}>
                  {isJa ? "公式サイトに戻る" : "返回官网"}
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <Link href="/app" className={brandClassName}>{brand}</Link>
        )}
        {showNotifications && (
          <NotificationBell items={notifications} unreadCount={unreadCount} locale={locale} />
        )}
      </div>
    </header>
  )
}
