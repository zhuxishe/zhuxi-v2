"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

export async function setLocale(locale: "zh" | "ja") {
  const cookieStore = await cookies()
  cookieStore.set("NEXT_LOCALE", locale, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  })
  revalidatePath("/")
}
