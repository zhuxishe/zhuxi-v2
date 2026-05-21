import Image from "next/image"
import Link from "next/link"
import styles from "./HomeActivityStrip.module.css"

const photos = [
  ["/images/landing/activity-wall-20260520/asakusa-01.webp", "浅草手工御守"],
  ["/images/landing/activity-wall-20260520/kichijoji-03.webp", "吉祥寺一日游"],
  ["/images/landing/activity-wall-20260520/showa-04.webp", "昭和纪念公园"],
  ["/images/landing/activity-wall-20260520/shibuya-party-02.webp", "涩谷交友派对"],
  ["/images/landing/activity-wall-20260520/team-game-05.webp", "团队合作游戏局"],
  ["/images/landing/activity-wall-20260520/bbq-03.webp", "台场 BBQ"],
  ["/images/landing/activity-wall-20260520/hogwarts-02.webp", "霍格沃茨魔法世界"],
  ["/images/landing/activity-wall-20260520/autumn-trip-05.webp", "秋游计划"],
] as const

export function HomeActivityStrip() {
  const stripPhotos = [...photos, ...photos]

  return (
    <div className="relative mt-6 w-full min-w-0 overflow-hidden rounded-[1.4rem] border border-[#e5dfd3] bg-white/86 py-4 shadow-[0_14px_34px_rgba(43,53,35,0.08)] md:mt-8 md:rounded-[1.8rem] md:py-5">
        <div className="mb-3 pr-20 pl-4 md:px-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-[#6b8f4e]">PHOTO WALL</p>
            <h2 className="mt-1 font-display text-2xl font-bold">最近的活动照片</h2>
          </div>
          <Link href="/reviews" className="absolute right-5 top-5 hidden min-h-11 place-items-center rounded-full bg-[#edf4e7] px-3 text-sm font-semibold text-[#5f8549] transition hover:bg-[#e4efd8] md:grid">
            查看全部
          </Link>
        </div>
        <div className={`${styles.strip} overflow-hidden`}>
          <div className={`${styles.marquee} flex w-max gap-3 px-5`}>
            {stripPhotos.map(([src, label], index) => (
              <figure key={`${src}-${index}`} className="relative overflow-hidden rounded-2xl shadow-[0_8px_22px_rgba(43,53,35,0.10)]">
                <Image src={src} alt={label} width={300} height={220} className="h-28 w-40 object-cover md:h-36 md:w-52" />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/82 via-black/42 to-transparent px-3 pb-2.5 pt-10 text-xs font-semibold text-white">
                  {label}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
    </div>
  )
}
