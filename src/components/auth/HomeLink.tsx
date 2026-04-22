import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

export function HomeLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
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
