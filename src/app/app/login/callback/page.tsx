import { handleAuthCallback } from "../actions"

export default async function AuthCallbackPage() {
  await handleAuthCallback()
  return null
}
