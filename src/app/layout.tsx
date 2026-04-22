import type { Metadata, Viewport } from "next"
import { Geist, Noto_Sans_SC, Noto_Serif_SC } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import "./globals.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const notoSansSc = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sans-sc",
  display: "swap",
})
const notoSerifSc = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-noto-serif-sc",
  display: "swap",
})

export const metadata: Metadata = {
  title: "竹溪社",
  description: "竹溪社 — 在日华人线下社交活动平台",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2d5016",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale === "ja" ? "ja" : "zh-CN"}>
      <body className={`${geist.variable} ${notoSansSc.variable} ${notoSerifSc.variable} font-sans antialiased bg-background text-foreground`} suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
