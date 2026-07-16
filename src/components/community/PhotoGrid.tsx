import Image from "next/image"
import Link from "next/link"
import type { CSSProperties } from "react"
import type { CommunityPostImage } from "@/lib/community/types"
import { communityMediaUrl } from "@/lib/community/media"
import { cn } from "@/lib/utils"

interface PhotoGridProps {
  images: readonly CommunityPostImage[]
  authorLabel: string
  imageLabel: string
  detailHref?: string
  priority?: boolean
  className?: string
}

export function PhotoGrid({
  images,
  authorLabel,
  imageLabel,
  detailHref,
  priority = false,
  className,
}: PhotoGridProps) {
  if (images.length === 0) return null

  const sortedImages = [...images].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 9)
  const count = sortedImages.length
  const gridClass = count === 1
    ? "grid-cols-1"
    : count === 2 || count === 4
      ? "grid-cols-2"
      : "grid-cols-3"

  return (
    <div className={cn("grid gap-1 overflow-hidden rounded-2xl", gridClass, className)}>
      {sortedImages.map((image, index) => {
        const label = `${authorLabel} · ${imageLabel} ${index + 1}/${count}`
        const frame = (
          <span
            className={cn(
              "relative block overflow-hidden bg-muted",
              count === 1 ? "w-full max-h-[22rem] min-h-44" : "aspect-square",
            )}
            style={count === 1 ? singleImageStyle(image) : undefined}
          >
            <Image
              src={communityMediaUrl(image.thumbnailPath || image.storagePath, true)}
              alt={label}
              fill
              sizes={count === 1 ? "(max-width: 448px) calc(100vw - 64px), 384px" : "(max-width: 448px) 33vw, 128px"}
              className="object-cover"
              priority={priority && index === 0}
              unoptimized
            />
          </span>
        )

        return detailHref ? (
          <Link
            key={image.id}
            href={detailHref}
            aria-label={label}
            className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {frame}
          </Link>
        ) : (
          <span key={image.id}>{frame}</span>
        )
      })}
    </div>
  )
}

function singleImageStyle(image: CommunityPostImage): CSSProperties {
  const width = image.width ?? 4
  const height = image.height ?? 3
  const sourceRatio = width > 0 && height > 0 ? width / height : 4 / 3
  const clampedRatio = Math.min(16 / 9, Math.max(4 / 5, sourceRatio))
  return { aspectRatio: String(clampedRatio) }
}
