import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { PlayerHomeAction } from "./types"

export function PlayerHomeActionCard({ action }: { action: PlayerHomeAction }) {
  return (
    <section className="relative min-h-[169px] overflow-hidden rounded-[10px] bg-[linear-gradient(110deg,#315c3d_0%,#46634d_100%)] px-[22px] py-4 text-white shadow-[0_7px_20px_rgb(49_92_61_/_12%)] [clip-path:polygon(0_0,calc(100%_-_37px)_0,100%_37px,100%_100%,0_100%)]">
      <Image
        src="/images/face-cover-studio/chalk-doodles/bamboo-01.png"
        alt=""
        width={178}
        height={182}
        className="pointer-events-none absolute -bottom-5 -right-1 w-36 rotate-[-6deg] opacity-20"
      />
      <div className="relative z-10 max-w-[18rem]">
        <p className="text-xs font-medium tracking-[0.08em] text-white/72">{action.eyebrow}</p>
        <span className="mt-1.5 block h-0.5 w-5 rounded-full bg-white/85" />
        <h2 className="mt-2.5 text-[1.42rem] font-semibold leading-[1.28] tracking-tight">{action.title}</h2>
        <p className="mt-1 text-[13px] leading-5 text-white/76">{action.description}</p>
        <Link
          href={action.href}
          className="relative mt-2 inline-flex h-[34px] items-center gap-2 rounded-[6px] bg-white px-[18px] text-[13px] font-semibold text-[#274b34] shadow-sm transition after:absolute after:-inset-y-[5px] after:inset-x-0 hover:bg-[#f5f7f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#315c3d]"
        >
          {action.cta}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
