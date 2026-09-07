import type { Metadata } from "next"
import Link from "next/link"
import { getLocale } from "next-intl/server"
import { LandingFooter } from "@/components/landing/LandingFooter"
import { LandingNav } from "@/components/landing/LandingNav"
import { getLegalDocument, legalContactEmail, legalUpdatedAt, type LegalDocumentKind } from "@/lib/legal-content"

export async function getLegalMetadata(kind: LegalDocumentKind): Promise<Metadata> {
  const document = getLegalDocument(kind, await getLocale())
  return {
    title: `${document.title} | 竹溪社 zhuxishe`,
    description: document.description,
    alternates: { canonical: `https://www.zhuxishe.jp/${kind}` },
  }
}

export async function LegalPage({ kind }: { kind: LegalDocumentKind }) {
  const locale = await getLocale()
  const isJa = locale === "ja"
  const document = getLegalDocument(kind, locale)
  const otherKind = kind === "privacy" ? "terms" : "privacy"
  const otherDocument = getLegalDocument(otherKind, locale)

  return (
    <>
      <LandingNav />
      <main className="min-h-screen bg-[#fffdf7] px-5 pb-16 pt-32 text-[#171717]">
        <article className="mx-auto max-w-3xl">
          <header className="border-b border-[#dedfce] pb-8">
            <p className="mb-4 text-sm font-semibold tracking-[0.16em] text-[#49643d]">竹溪社 · ZHUXISHE</p>
            <h1 className="font-display text-3xl font-bold leading-snug sm:text-4xl">{document.title}</h1>
            <p className="mt-4 leading-7 text-[#505748]">{document.description}</p>
            <p className="mt-4 text-sm text-[#65705e]">
              {isJa ? "最終更新日" : "更新日期"}：<time dateTime={legalUpdatedAt}>{legalUpdatedAt}</time>
            </p>
          </header>
          <div className="space-y-9 py-9">
            {document.sections.map((section, index) => (
              <section key={section.title} aria-labelledby={`legal-section-${index}`}>
                <h2 id={`legal-section-${index}`} className="mb-3 text-xl font-semibold leading-8 text-[#355026]">
                  {index + 1}. {section.title}
                </h2>
                <div className="space-y-3 text-[15px] leading-8 text-[#343c2e]">
                  {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </section>
            ))}
          </div>
          <aside className="rounded-2xl border border-[#d9e2cf] bg-[#edf3e6] p-6">
            <h2 className="font-semibold text-[#355026]">{isJa ? "お問い合わせ" : "联系我们"}</h2>
            <a href={`mailto:${legalContactEmail}`} className="mt-2 inline-block break-all text-sm underline underline-offset-4">
              {legalContactEmail}
            </a>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link href={`/${otherKind}`} className="underline underline-offset-4">{otherDocument.title}</Link>
              <Link href="/" className="underline underline-offset-4">{isJa ? "ホームへ戻る" : "返回首页"}</Link>
            </div>
          </aside>
        </article>
      </main>
      <LandingFooter />
    </>
  )
}
