import type { User } from "@supabase/supabase-js"
import { getVerifiedUser } from "@/lib/auth/verified-user"
import { createClient } from "@/lib/supabase/server"

const OFFICIAL_ACCOUNT_EMAILS = new Set([
  "zhuxishe@gmail.com",
  "tsyronjp@gmail.com",
  "tokyojht4@gmail.com",
])

export async function canCurrentUserUseReservedNickname(): Promise<boolean> {
  const user = await getVerifiedUser(await createClient())
  return isOfficialNicknameAccount(user)
}

// Only pass the Auth-verified user here, never form data or user_metadata.
export function isOfficialNicknameAccount(
  user: Pick<User, "email" | "email_confirmed_at"> | null,
): boolean {
  return Boolean(user?.email_confirmed_at && user.email
    && OFFICIAL_ACCOUNT_EMAILS.has(user.email.trim().toLowerCase()))
}
