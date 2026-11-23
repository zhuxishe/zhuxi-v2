import { createClient } from "@/lib/supabase/client"
import { ACTIVITY_MEDIA_BUCKET } from "./media"

export function uploadActivityImage(path: string, token: string, file: File) {
  return createClient().storage
    .from(ACTIVITY_MEDIA_BUCKET)
    .uploadToSignedUrl(path, token, file, {
      contentType: file.type,
      cacheControl: "31536000",
    })
}
