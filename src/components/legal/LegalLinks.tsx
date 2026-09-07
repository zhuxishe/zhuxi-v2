"use client"

import Link from "next/link"
import { useLocale } from "next-intl"

export function LegalLinks() {
  const isJa = useLocale() === "ja"

  return (
    <nav aria-label={isJa ? "利用に関する情報" : "使用与隐私说明"} className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
      <Link href="/privacy" className="underline underline-offset-4 hover:text-primary">
        {isJa ? "プライバシーポリシー" : "隐私政策"}
      </Link>
      <Link href="/terms" className="underline underline-offset-4 hover:text-primary">
        {isJa ? "利用規約" : "使用条款"}
      </Link>
    </nav>
  )
}
