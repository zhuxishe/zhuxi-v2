"use client"

import Image from "next/image"
import { useState } from "react"
import { Leaf, Sprout, UserRound, Waves, type LucideIcon } from "lucide-react"
import type { CommunityProfile } from "@/lib/community/types"
import { communityAvatarUrl } from "@/lib/community/media"
import { cn } from "@/lib/utils"

type AvatarSize = "sm" | "md" | "lg"

interface CommunityAvatarProps {
  profile: CommunityProfile | null
  alt?: string
  size?: AvatarSize
  audience?: "member" | "admin"
  className?: string
}

const SIZE_CLASSES: Record<AvatarSize, { frame: string; icon: string; sizes: string }> = {
  sm: { frame: "size-8", icon: "size-4", sizes: "32px" },
  md: { frame: "size-10", icon: "size-5", sizes: "40px" },
  lg: { frame: "size-16", icon: "size-7", sizes: "64px" },
}

const PRESET_ICONS: Record<string, LucideIcon> = {
  bamboo: Sprout,
  stream: Waves,
  leaf: Leaf,
}

export function CommunityAvatar({
  profile,
  alt = "",
  size = "md",
  audience = "member",
  className,
}: CommunityAvatarProps) {
  const styles = SIZE_CLASSES[size]
  const uploadedImageUrl = profile && (profile.avatarKind === "upload" || profile.avatarKind === "personal")
    ? communityAvatarUrl(profile, audience)
    : null

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-primary ring-1 ring-border",
        styles.frame,
        className,
      )}
    >
      {uploadedImageUrl ? (
        <AvatarPhoto
          key={uploadedImageUrl}
          src={uploadedImageUrl}
          alt={alt}
          sizes={styles.sizes}
          fallbackIcon={resolveFallbackIcon(profile)}
          iconClassName={styles.icon}
        />
      ) : (
        <AvatarFallback icon={resolveFallbackIcon(profile)} alt={alt} iconClassName={styles.icon} />
      )}
    </span>
  )
}

function AvatarPhoto({
  src,
  alt,
  sizes,
  fallbackIcon,
  iconClassName,
}: {
  src: string
  alt: string
  sizes: string
  fallbackIcon: LucideIcon
  iconClassName: string
}) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return <AvatarFallback icon={fallbackIcon} alt={alt} iconClassName={iconClassName} />
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="object-cover"
      unoptimized
      onError={() => setFailed(true)}
    />
  )
}

function AvatarFallback({
  icon: Icon,
  alt,
  iconClassName,
}: {
  icon: LucideIcon
  alt: string
  iconClassName: string
}) {
  return (
    <span role={alt ? "img" : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
      <Icon className={iconClassName} aria-hidden="true" />
    </span>
  )
}

function resolveFallbackIcon(profile: CommunityProfile | null): LucideIcon {
  if (profile?.avatarKind === "preset" && profile.presetAvatar) {
    return PRESET_ICONS[profile.presetAvatar] ?? UserRound
  }
  return UserRound
}
