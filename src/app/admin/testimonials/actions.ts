"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdmin } from "@/lib/auth/admin"
import { revalidatePath } from "next/cache"

interface TestimonialInput {
  name: string
  school?: string
  quote: string
  is_published?: boolean
  sort_order?: number
}

export async function createTestimonial(input: TestimonialInput) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { error } = await supabase.from("testimonials").insert({
    name: input.name,
    school: input.school || null,
    quote: input.quote,
    is_published: input.is_published ?? true,
    sort_order: input.sort_order ?? 0,
  })

  if (error) return { error: error.message }
  revalidatePath("/admin/testimonials")
  revalidatePath("/")
  return { success: true }
}

export async function updateTestimonial(id: string, input: Partial<TestimonialInput>) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from("testimonials")
    .update(input)
    .eq("id", id)

  if (error) return { error: error.message }
  revalidatePath("/admin/testimonials")
  revalidatePath("/")
  return { success: true }
}

export async function deleteTestimonial(id: string) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from("testimonials")
    .delete()
    .eq("id", id)

  if (error) return { error: error.message }
  revalidatePath("/admin/testimonials")
  revalidatePath("/")
  return { success: true }
}

export async function toggleTestimonialPublished(id: string, is_published: boolean) {
  await requireAdmin()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from("testimonials")
    .update({ is_published })
    .eq("id", id)

  if (error) return { error: error.message }
  revalidatePath("/admin/testimonials")
  revalidatePath("/")
  return { success: true }
}
