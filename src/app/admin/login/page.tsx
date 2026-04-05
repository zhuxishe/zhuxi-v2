"use client"

import { useState } from "react"
import { loginAdmin } from "./actions"
import { Button } from "@/components/ui/button"

export default function AdminLoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    const result = await loginAdmin(formData)
    if (result?.error) {
      setError(result.error)
      setPending(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8">竹溪社 管理后台</h1>
        <form action={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">邮箱</label>
            <input
              name="email"
              type="email"
              required
              className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="admin@zhuxishe.com"
            />
          </div>
          <div>
            <label className="text-sm font-medium">密码</label>
            <input
              name="password"
              type="password"
              required
              className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "登录中..." : "登录"}
          </Button>
        </form>
      </div>
    </main>
  )
}
