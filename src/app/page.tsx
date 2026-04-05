import { useTranslations } from "next-intl"

export default function HomePage() {
  const t = useTranslations("home")

  return (
    <main className="min-h-screen gradient-hero">
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-4 text-muted-foreground">
          {t("description")}
        </p>
      </div>
    </main>
  )
}
