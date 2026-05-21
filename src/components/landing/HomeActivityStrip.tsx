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
    <section className="bg-[#fffdf7] px-5 pb-10">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[1.6rem] border border-[#e5dfd3] bg-white/88 py-5 shadow-[0_14px_34px_rgba(43,53,35,0.08)]">
        <div className="mb-4 flex items-end justify-between gap-4 px-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-[#6b8f4e]">PHOTO WALL</p>
            <h2 className="mt-1 font-display text-2xl font-bold">最近的活动照片</h2>
          </div>
          <Link href="/reviews" className="grid min-h-11 shrink-0 place-items-center rounded-full px-3 text-sm font-semibold text-[#5f8549] transition hover:bg-[#edf4e7]">
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
    </section>
  )
}
