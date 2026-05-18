import Image from "next/image"
import Link from "next/link"
import { BookOpen, ChevronRight } from "lucide-react"

export function ScriptLibraryTeaser({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <Link href="/scripts/library" className="group grid overflow-hidden rounded-[1.8rem] border border-[#e5dfd3] bg-white/90 shadow-[0_16px_42px_rgba(44,55,35,0.10)] transition hover:-translate-y-0.5 md:grid-cols-[0.95fr_1.05fr]">
      <div className="relative min-h-[260px] overflow-hidden">
        <Image src="/images/landing/mobile-redesign/activity-script-bg.webp" alt="" fill sizes="(min-width: 768px) 45vw, 100vw" className="object-cover transition duration-700 group-hover:scale-[1.03]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent md:bg-gradient-to-r" />
      </div>
      <div className="flex flex-col justify-center p-7 md:p-9">
        <span className="mb-5 grid size-14 place-items-center rounded-full bg-[#edf4e7] text-[#5f8549]">
          <BookOpen className="size-7" />
        </span>
        <h2 className="font-display text-4xl font-semibold leading-tight">{title}</h2>
        <p className="mt-4 text-base leading-[1.9] text-[#4c5148]">{body}</p>
        <span className="mt-7 inline-flex w-fit items-center gap-2 rounded-full bg-[#6b8f4e] px-6 py-3 text-sm font-semibold text-white">
          {cta}
          <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}
