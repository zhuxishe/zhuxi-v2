import Image from "next/image"
import { UserRound } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProfileAvatarProps {
  src: string | null
  alt: string
  size?: "md" | "lg"
  className?: string
  priority?: boolean
}

const SIZE_CLASSES = {
  md: "size-14",
  lg: "size-16",
} as const

export function ProfileAvatar({
  src,
  alt,
  size = "md",
  className,
  priority = false,
}: ProfileAvatarProps) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-primary ring-1 ring-border/80",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          priority={priority}
          sizes={size === "lg" ? "64px" : "56px"}
          className="object-cover"
        />
      ) : (
        <UserRound className={size === "lg" ? "size-8" : "size-6"} strokeWidth={1.6} aria-hidden="true" />
      )}
    </span>
  )
}
