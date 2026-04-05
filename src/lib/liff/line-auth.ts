"use client"

import { createClient } from "@/lib/supabase/client"

export async function authenticateWithLine(): Promise<{ success: boolean; error?: string }> {
  try {
    const liffModule = await import("./index")
    await liffModule.initLiff()

    if (!liffModule.isLineLoggedIn()) {
      liffModule.lineLogin(window.location.href)
      return { success: false, error: "Redirecting to LINE login" }
    }

    const idToken = liffModule.getLineIdToken()
    const profile = await liffModule.getLineProfile()

    if (!idToken || !profile) {
      return { success: false, error: "Failed to get LINE credentials" }
    }

    const res = await fetch("/api/auth/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, profile }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }

    const data = await res.json()

    const supabase = createClient()
    const { error } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })

    if (error) return { success: false, error: "Failed to set session" }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "LINE auth failed" }
  }
}
