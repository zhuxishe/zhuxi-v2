import type { PostgrestError } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

interface RpcClient {
  rpc<T>(name: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: PostgrestError | null }>
}

export async function callCommunityRpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const client = await createClient()
  return (client as unknown as RpcClient).rpc<T>(name, args)
}

export function communityErrorMessage(error: PostgrestError | null, fallback = "操作失败，请稍后重试") {
  if (!error) return fallback
  const message = error.message.toLowerCase()
  if (message.includes("nickname") && (message.includes("unique") || error.code === "23505")) {
    return "这个社区昵称已经被使用"
  }
  if (message.includes("community profile required") || message.includes("set a community nickname")) {
    return "请先设置社区昵称和头像"
  }
  if (message.includes("community write access denied") || message.includes("posting is currently unavailable")) {
    return "当前账号暂时不能发布或互动"
  }
  if (message.includes("blocked") || message.includes("interaction is unavailable")) {
    return "你们之间当前无法互动"
  }
  if (message.includes("not approved") || message.includes("approved community membership")) {
    return "只有正式会员可以使用社区"
  }
  if (message.includes("already has a pending report")) return "你已举报过这条内容"
  return fallback
}
