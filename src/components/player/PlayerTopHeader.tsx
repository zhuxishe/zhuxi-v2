import Image from "next/image"
import Link from "next/link"

export function PlayerTopHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-md items-center px-4">
        <Link href="/" className="inline-flex items-center gap-2 text-primary transition-opacity hover:opacity-80">
          <Image src="/logo.svg" alt="" width={28} height={28} className="size-7" priority />
          <span className="heading-display text-base font-semibold leading-none">竹溪社</span>
        </Link>
      </div>
    </header>
  )
}
