"use server"

import { createClient } from "@/lib/supabase/server"
import { requireAdmin } from "@/lib/auth/admin"

export async function updateVerification(memberId: string, data: { student_id_verified: boolean; photo_verified: boolean }) {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("member_verification")
    .upsert({
      member_id: memberId,
      ...data,
      verified_by: admin.id,
      verified_at: (data.student_id_verified && data.photo_verified) ? new Date().toISOString() : null,
    }, { onConflict: "member_id" })

  if (error) return { error: error.message }
  return { success: true }
}
