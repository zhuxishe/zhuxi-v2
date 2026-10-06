import { createClient } from "@/lib/supabase/server"
import { isValidBirthDate } from "@/lib/member-master/birth-date"

export interface BirthdayCompletion {
  eligible: boolean
  birth_date: string | null
  age_range: string | null
}

export function parseBirthdayCompletion(value: unknown): BirthdayCompletion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.eligible !== "boolean"
    || (record.birth_date !== null && !isValidBirthDate(record.birth_date))
    || (record.age_range !== null && typeof record.age_range !== "string")) return null
  return { eligible: record.eligible, birth_date: record.birth_date as string | null, age_range: record.age_range }
}

export async function fetchMyBirthdayCompletion(): Promise<BirthdayCompletion> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_my_birthday_completion")
  const state = parseBirthdayCompletion(data)
  if (error || !state) throw new Error("Unable to load birthday completion")
  return state
}
