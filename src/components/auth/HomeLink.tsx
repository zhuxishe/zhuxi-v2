import Image from "next/image"
import Link from "next/link"
import { HOME_SKIP_INTRO_HREF } from "@/lib/landing-intro"
import { cn } from "@/lib/utils"

export function HomeLink({ className }: { className?: string }) {
  return (
    <Link
      href={HOME_SKIP_INTRO_HREF}
      className={cn(
        "inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary",
        className
      )}
    >
      <Image src="/logo.svg" alt="" width={24} height={24} className="size-6" />
      <span>返回首页</span>
    </Link>
  )
}
