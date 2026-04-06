"use server"

import { createClient as createServiceClient } from "@supabase/supabase-js"
import { requireAdmin } from "@/lib/auth/admin"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getAdminDb() {
  return createServiceClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function updateMemberIdentity(memberId: string, data: any) {
  await requireAdmin()
  const db = getAdminDb()
  const { error } = await db
    .from("member_identity")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("member_id", memberId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateMemberLanguage(memberId: string, data: any) {
  await requireAdmin()
  const db = getAdminDb()
  const { error } = await db
    .from("member_language")
    .upsert({ member_id: memberId, ...data, updated_at: new Date().toISOString() }, { onConflict: "member_id" })
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateMemberInterests(memberId: string, data: any) {
  await requireAdmin()
  const db = getAdminDb()
  const { error } = await db
    .from("member_interests")
    .upsert({ member_id: memberId, ...data, updated_at: new Date().toISOString() }, { onConflict: "member_id" })
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateMemberPersonality(memberId: string, data: any) {
  await requireAdmin()
  const db = getAdminDb()
  const { error } = await db
    .from("member_personality")
    .upsert({ member_id: memberId, ...data, updated_at: new Date().toISOString() }, { onConflict: "member_id" })
  if (error) return { error: error.message }
  return { success: true }
}

export async function updateMemberBoundaries(memberId: string, data: any) {
  await requireAdmin()
  const db = getAdminDb()
  const { error } = await db
    .from("member_boundaries")
    .upsert({ member_id: memberId, ...data, updated_at: new Date().toISOString() }, { onConflict: "member_id" })
  if (error) return { error: error.message }
  return { success: true }
}
