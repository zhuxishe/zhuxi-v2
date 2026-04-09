"use server"

interface ContactInput {
  name: string
  email: string
  message: string
}

export async function submitContactForm(input: ContactInput) {
  if (!input.name.trim() || !input.email.trim() || !input.message.trim()) {
    return { error: "请填写所有必填项" }
  }

  // TODO: 后续可接入邮件通知或 Supabase contact_submissions 表
  // 目前仅做输入验证，返回成功状态
  console.log("[Contact]", input.email, input.name)

  return { success: true }
}
