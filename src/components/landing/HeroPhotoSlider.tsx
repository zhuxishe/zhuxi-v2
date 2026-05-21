import Image from "next/image"
import styles from "./HeroPhotoSlider.module.css"

const heroPhotos = [
  "/images/landing/activity-wall-20260520/founded-01.webp",
  "/images/landing/activity-wall-20260520/bbq-01.webp",
  "/images/landing/activity-wall-20260520/shibuya-party-01.webp",
  "/images/landing/activity-wall-20260520/boardgame-01.webp",
] as const

export function HeroPhotoSlider() {
  return (
    <div className={styles.slider} aria-hidden="true">
      {heroPhotos.map((photo, index) => (
        <div key={photo} className={styles.slide}>
          <Image src={photo} alt="" fill priority={index === 0} sizes="100vw" className="object-cover" />
        </div>
      ))}
    </div>
  )
}
