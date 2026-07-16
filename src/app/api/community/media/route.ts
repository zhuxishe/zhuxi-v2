import { NextResponse, type NextRequest } from "next/server"
import { getAdmin } from "@/lib/auth/admin"
import { getPlayerInfo } from "@/lib/auth/player"
import { getCommunityContext } from "@/lib/auth/community"
import {
  COMMUNITY_AVATAR_BUCKET,
  COMMUNITY_MEDIA_BUCKET,
} from "@/lib/community/constants"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

function validPath(path: string) {
  return path.length > 0
    && path.length <= 500
    && !path.includes("..")
    && !path.startsWith("/")
    && /^[a-zA-Z0-9/_\-.]+$/.test(path)
}

export async function GET(request: NextRequest) {
  const bucket = request.nextUrl.searchParams.get("bucket")
  const path = request.nextUrl.searchParams.get("path") ?? ""
  if ((bucket !== COMMUNITY_MEDIA_BUCKET && bucket !== COMMUNITY_AVATAR_BUCKET) || !validPath(path)) {
    return NextResponse.json({ error: "图片地址无效" }, { status: 400 })
  }

  const adminView = request.nextUrl.searchParams.get("audience") === "admin"
  const admin = adminView ? await getAdmin() : null
  const player = admin ? null : await getPlayerInfo()
  if (!admin && (!player || player.status !== "approved")) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 })
  }
  if (player) {
    const context = await getCommunityContext(player)
    if (context.restriction?.type === "permanent_ban") {
      return NextResponse.json({ error: "无权访问" }, { status: 403 })
    }
  }

  const db = createAdminClient()
  if (bucket === COMMUNITY_AVATAR_BUCKET) {
    const { data: avatarProfile, error: avatarError } = await db
      .from("community_profiles")
      .select("id")
      .eq("avatar_path", path)
      .maybeSingle<{ id: string }>()
    if (avatarError) {
      console.error("[community media] avatar visibility lookup failed", avatarError)
      return NextResponse.json({ error: "图片不存在" }, { status: 404 })
    }
    if (!avatarProfile) {
      if (!admin) return NextResponse.json({ error: "图片不存在" }, { status: 404 })
      const evidenceResult = await db.rpc("community_service_media_evidence_exists", {
        p_bucket_id: bucket,
        p_object_path: path,
      })
      if (evidenceResult.error || !evidenceResult.data) {
        if (evidenceResult.error) console.error("[community media] avatar evidence lookup failed", evidenceResult.error)
        return NextResponse.json({ error: "图片不存在" }, { status: 404 })
      }
    }
    if (!admin && player && avatarProfile) {
      const blockedResult = await db
        .from("community_blocks")
        .select("blocked_profile_id", { count: "exact", head: true })
        .eq("blocker_member_id", player.memberId)
        .eq("blocked_profile_id", avatarProfile.id)
      if (blockedResult.error) {
        console.error("[community media] avatar block lookup failed", blockedResult.error)
        return NextResponse.json({ error: "图片不存在" }, { status: 404 })
      }
      if (blockedResult.count) return NextResponse.json({ error: "图片不存在" }, { status: 404 })
    }
  } else {
    const { data: image, error: imageError } = await db
      .from("community_post_images")
      .select("post_id")
      .or(`storage_path.eq.${path},thumbnail_path.eq.${path}`)
      .maybeSingle<{ post_id: string }>()
    if (imageError) {
      console.error("[community media] image lookup failed", imageError)
      return NextResponse.json({ error: "图片不存在" }, { status: 404 })
    }
    if (!image) {
      if (!admin) return NextResponse.json({ error: "图片不存在" }, { status: 404 })
      const evidenceResult = await db.rpc("community_service_media_evidence_exists", {
        p_bucket_id: bucket,
        p_object_path: path,
      })
      if (evidenceResult.error || !evidenceResult.data) {
        if (evidenceResult.error) console.error("[community media] photo evidence lookup failed", evidenceResult.error)
        return NextResponse.json({ error: "图片不存在" }, { status: 404 })
      }
    }

    if (image) {
      const [postResult, hiddenResult] = await Promise.all([
        db.from("community_posts").select("status, is_anonymous, author_profile_id").eq("id", image.post_id).maybeSingle<{
          status: string
          is_anonymous: boolean
          author_profile_id: string | null
        }>(),
        player
          ? db.from("community_user_hides").select("post_id", { count: "exact", head: true }).eq("member_id", player.memberId).eq("post_id", image.post_id)
          : Promise.resolve({ count: 0, error: null }),
      ])
      if (postResult.error || hiddenResult.error) {
        console.error("[community media] post visibility lookup failed", postResult.error ?? hiddenResult.error)
        return NextResponse.json({ error: "图片不可用" }, { status: 404 })
      }
      const post = postResult.data
      if (!post || (!admin && post.status !== "published") || hiddenResult.count) {
        return NextResponse.json({ error: "图片不可用" }, { status: 404 })
      }
      if (!admin && player && !post.is_anonymous && post.author_profile_id) {
        const blockedResult = await db
          .from("community_blocks")
          .select("blocked_profile_id", { count: "exact", head: true })
          .eq("blocker_member_id", player.memberId)
          .eq("blocked_profile_id", post.author_profile_id)
        if (blockedResult.error) {
          console.error("[community media] post block lookup failed", blockedResult.error)
          return NextResponse.json({ error: "图片不可用" }, { status: 404 })
        }
        if (blockedResult.count) return NextResponse.json({ error: "图片不可用" }, { status: 404 })
      }
    }
  }

  const { data, error } = await db.storage.from(bucket).download(path)
  if (error || !data) return NextResponse.json({ error: "图片不存在" }, { status: 404 })
  return new NextResponse(data.stream(), {
    headers: {
      "Content-Type": data.type || "image/webp",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
