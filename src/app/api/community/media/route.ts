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

async function isCommunityInteractionBlocked(
  db: ReturnType<typeof createAdminClient>,
  viewerMemberId: string,
  otherProfileId: string,
) {
  const [viewerMapping, otherMapping, forwardBlock] = await Promise.all([
    db.schema("private").from("community_profile_members").select("profile_id").eq("member_id", viewerMemberId).maybeSingle<{ profile_id: string }>(),
    db.schema("private").from("community_profile_members").select("member_id").eq("profile_id", otherProfileId).maybeSingle<{ member_id: string | null }>(),
    db.from("community_blocks").select("blocked_profile_id", { count: "exact", head: true }).eq("blocker_member_id", viewerMemberId).eq("blocked_profile_id", otherProfileId),
  ])
  const lookupError = viewerMapping.error ?? otherMapping.error ?? forwardBlock.error
  if (lookupError) throw lookupError
  if (forwardBlock.count) return true
  if (!viewerMapping.data?.profile_id || !otherMapping.data?.member_id) return false

  const reverseBlock = await db
    .from("community_blocks")
    .select("blocked_profile_id", { count: "exact", head: true })
    .eq("blocker_member_id", otherMapping.data.member_id)
    .eq("blocked_profile_id", viewerMapping.data.profile_id)
  if (reverseBlock.error) throw reverseBlock.error
  return !!reverseBlock.count
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

  const db = createAdminClient()
  if (bucket === COMMUNITY_AVATAR_BUCKET) {
    const [communityProfileResult, personalProfileResult, pendingUploadResult] = await Promise.all([
      db
        .from("community_profiles")
        .select("id")
        .eq("avatar_path", path)
        .maybeSingle<{ id: string }>(),
      db
        .from("member_identity")
        .select("member_id")
        .eq("personal_avatar_path", path)
        .maybeSingle<{ member_id: string }>(),
      player
        ? db
          .schema("private")
          .from("community_processed_uploads")
          .select("member_id")
          .eq("member_id", player.memberId)
          .eq("bucket_id", COMMUNITY_AVATAR_BUCKET)
          .eq("storage_path", path)
          .eq("thumbnail_path", path)
          .is("cleanup_claimed_at", null)
          .maybeSingle<{ member_id: string }>()
        : Promise.resolve({ data: null, error: null }),
    ])
    const personalAvatarColumnMissing = personalProfileResult.error?.code === "42703"
      || personalProfileResult.error?.code === "PGRST204"
    if (communityProfileResult.error || pendingUploadResult.error || (personalProfileResult.error && !personalAvatarColumnMissing)) {
      console.error(
        "[community media] avatar visibility lookup failed",
        communityProfileResult.error ?? personalProfileResult.error ?? pendingUploadResult.error,
      )
      return NextResponse.json({ error: "图片不存在" }, { status: 404 })
    }
    const avatarProfile = communityProfileResult.data
    const personalProfile = personalAvatarColumnMissing ? null : personalProfileResult.data
    const isOwnPersonalAvatar = !!player && (
      personalProfile?.member_id === player.memberId
      || pendingUploadResult.data?.member_id === player.memberId
    )
    if (!admin && player && !isOwnPersonalAvatar) {
      const context = await getCommunityContext(player)
      if (context.restriction?.type === "permanent_ban") {
        return NextResponse.json({ error: "无权访问" }, { status: 403 })
      }
    }
    if (!avatarProfile && !personalProfile) {
      if (!admin && !isOwnPersonalAvatar) return NextResponse.json({ error: "图片不存在" }, { status: 404 })
      if (isOwnPersonalAvatar) {
        // The crop preview is readable by its owner before the profile form is
        // saved; the processed-upload proof above prevents arbitrary paths.
      } else {
        const evidenceResult = await db.rpc("community_service_media_evidence_exists", {
          p_bucket_id: bucket,
          p_object_path: path,
        })
        if (evidenceResult.error || !evidenceResult.data) {
          if (evidenceResult.error) console.error("[community media] avatar evidence lookup failed", evidenceResult.error)
          return NextResponse.json({ error: "图片不存在" }, { status: 404 })
        }
      }
    }
    if (!admin && player && personalProfile && !avatarProfile && personalProfile.member_id !== player.memberId) {
      return NextResponse.json({ error: "图片不存在" }, { status: 404 })
    }
    if (!admin && player && avatarProfile && !isOwnPersonalAvatar) {
      let blocked = false
      try {
        blocked = await isCommunityInteractionBlocked(db, player.memberId, avatarProfile.id)
      } catch (error) {
        console.error("[community media] avatar block lookup failed", error)
        return NextResponse.json({ error: "图片不存在" }, { status: 404 })
      }
      if (blocked) return NextResponse.json({ error: "图片不存在" }, { status: 404 })
    }
  } else {
    if (player) {
      const context = await getCommunityContext(player)
      if (context.restriction?.type === "permanent_ban") {
        return NextResponse.json({ error: "无权访问" }, { status: 403 })
      }
    }
    const [imageResult, pendingUploadResult] = await Promise.all([
      db
        .from("community_post_images")
        .select("post_id")
        .or(`storage_path.eq.${path},thumbnail_path.eq.${path}`)
        .maybeSingle<{ post_id: string }>(),
      player
        ? db
          .schema("private")
          .from("community_processed_uploads")
          .select("member_id")
          .eq("member_id", player.memberId)
          .eq("bucket_id", COMMUNITY_MEDIA_BUCKET)
          .or(`storage_path.eq.${path},thumbnail_path.eq.${path}`)
          .is("cleanup_claimed_at", null)
          .maybeSingle<{ member_id: string }>()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (imageResult.error || pendingUploadResult.error) {
      console.error(
        "[community media] image visibility lookup failed",
        imageResult.error ?? pendingUploadResult.error,
      )
      return NextResponse.json({ error: "图片不存在" }, { status: 404 })
    }
    const image = imageResult.data
    const isOwnPendingPhoto = !!player && pendingUploadResult.data?.member_id === player.memberId
    if (!image) {
      if (!admin && !isOwnPendingPhoto) {
        return NextResponse.json({ error: "图片不存在" }, { status: 404 })
      }
      if (admin) {
        const evidenceResult = await db.rpc("community_service_media_evidence_exists", {
          p_bucket_id: bucket,
          p_object_path: path,
        })
        if (evidenceResult.error || !evidenceResult.data) {
          if (evidenceResult.error) console.error("[community media] photo evidence lookup failed", evidenceResult.error)
          return NextResponse.json({ error: "图片不存在" }, { status: 404 })
        }
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
        let blocked = false
        try {
          blocked = await isCommunityInteractionBlocked(db, player.memberId, post.author_profile_id)
        } catch (error) {
          console.error("[community media] post block lookup failed", error)
          return NextResponse.json({ error: "图片不可用" }, { status: 404 })
        }
        if (blocked) return NextResponse.json({ error: "图片不可用" }, { status: 404 })
      }
    }
  }

  const { data, error } = await db.storage.from(bucket).download(path)
  if (error || !data) return NextResponse.json({ error: "图片不存在" }, { status: 404 })
  return new NextResponse(data.stream(), {
    headers: {
      "Content-Type": data.type || "image/webp",
      // Authorization depends on the current account, owner relationship,
      // sanctions and two-way blocks. Never reuse a protected image response
      // after logout or an account switch in the same browser.
      "Cache-Control": "private, no-store, max-age=0",
      "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
