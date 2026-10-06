"use server"

import { revalidatePath } from "next/cache"
import { requirePlayer } from "@/lib/auth/player"
import { createClient } from "@/lib/supabase/server"
import { isValidBirthDate } from "@/lib/member-master/birth-date"
import { parseBirthdayCompletion, type BirthdayCompletion } from "@/lib/profile/birthday-completion"

type BirthdayCompletionResult =
  | { state: BirthdayCompletion; error?: never }
  | { error: "invalidDate" | "alreadySet" | "notEligible" | "saveFailed"; state?: never }

export async function completeBirthdayAction(birthDate: string): Promise<BirthdayCompletionResult> {
  const player = await requirePlayer()
  if (!isValidBirthDate(birthDate)) return { error: "invalidDate" }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("complete_my_birth_date", { p_birth_date: birthDate })
    if (error) {
      if (error.message.includes("BIRTH_DATE_INVALID")) return { error: "invalidDate" }
      if (error.message.includes("BIRTH_DATE_ALREADY_SET")) return { error: "alreadySet" }
      if (error.message.includes("BIRTH_DATE_NOT_ELIGIBLE")) return { error: "notEligible" }
      return { error: "saveFailed" }
    }
    const state = parseBirthdayCompletion(data)
    if (!state || state.birth_date !== birthDate) return { error: "saveFailed" }

    revalidatePath("/app", "layout")
    revalidatePath("/app/profile")
    revalidatePath("/app/profile/birthday")
    revalidatePath("/admin/members")
    revalidatePath(`/admin/members/${player.memberId}`)
    return { state }
  } catch {
    return { error: "saveFailed" }
  }
}
