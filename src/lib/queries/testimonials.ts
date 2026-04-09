import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export interface Testimonial {
  id: string
  name: string
  school: string | null
  quote: string
  is_published: boolean
  sort_order: number
  created_at: string
}

export interface TestimonialPublic {
  id: string
  name: string
  school: string | null
  quote: string
}

export async function fetchPublishedTestimonials(): Promise<TestimonialPublic[]> {
  // 公开读取已发布的 testimonials，走 RLS 而非 service role
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("testimonials")
    .select("id, name, school, quote")
    .eq("is_published", true)
    .order("sort_order", { ascending: true })

  if (error) return []
  return (data ?? []) as TestimonialPublic[]
}

export async function fetchAllTestimonials(): Promise<Testimonial[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .order("sort_order", { ascending: true })

  if (error) throw error
  return (data ?? []) as Testimonial[]
}
