"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/admin"
import { runContentMediaCleanupJob } from "@/lib/content-media-cleanup"

export async function retryContentMediaCleanupJob(jobId: string) {
  const admin = await requireAdmin()
  if (admin.role !== "super_admin") return { error: "仅超级管理员可以重试文件清理" }
  const result = await runContentMediaCleanupJob(jobId)
  if (result.error) return result
  revalidatePath("/admin/scripts")
  revalidatePath("/admin/reviews")
  return { success: true }
}
