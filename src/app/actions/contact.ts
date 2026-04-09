"use server"

import { createClient } from "@/lib/supabase/server"

interface ContactInput {
  name: string
  email: string
  message: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function submitContactForm(input: ContactInput) {
  const name = input.name.trim()
  const email = input.email.trim()
  const message = input.message.trim()

  if (!name || !email || !message) {
    return { error: "required" }
  }
  if (!EMAIL_RE.test(email)) {
    return { error: "invalidEmail" }
  }
  if (name.length > 100 || email.length > 200 || message.length > 5000) {
    return { error: "tooLong" }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("contact_submissions")
    .insert({ name, email, message })

  if (error) {
    console.error("[Contact] insert failed:", error.code)
    return { error: "serverError" }
  }

  return { success: true }
}
