"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateScript } from "@/app/admin/scripts/[id]/edit/actions"
import {
  discardScriptCoverUpload,
  finalizeScriptCoverUpload,
  prepareScriptCoverUpload,
  removeScriptCover,
  replaceScriptCoverWithExternalUrl,
} from "@/app/admin/scripts/new/upload-actions"
import { Button } from "@/components/ui/button"
import { ScriptEditBasicFields } from "@/components/admin/ScriptEditBasicFields"
import { ScriptContentFields } from "@/components/admin/ScriptContentFields"
import { ScriptActivityPlacementFields } from "@/components/admin/ScriptActivityPlacementFields"
import type { ScriptRole } from "@/components/admin/ScriptRoleEditor"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import { createClient } from "@/lib/supabase/client"

export interface ScriptData {
  id: string
  title: string
  title_ja: string | null
  author: string | null
  description: string | null
  player_count_min: number | null
  player_count_max: number | null
  duration_minutes: number | null
  difficulty: string | null
  genre_tags: string[] | null
  theme_tags: string[] | null
  content_html: string | null
  warnings: string[] | null
  roles: ScriptRole[] | null
  cover_url: string | null
  pdf_url: string | null
  page_images: string[] | null
  page_image_paths: string[] | null
  pdf_storage_path: string | null
  is_published: boolean | null
  is_featured: boolean | null
  is_player_visible: boolean | null
  budget: string | null
  location: string | null
  is_social_script: boolean | null
  show_on_player_activity: boolean | null
  player_activity_order: number | null
  pin_in_social_library: boolean | null
  social_library_order: number | null
  updated_at: string
  protected_updated_at: string | null
}

export function ScriptEditForm({ script }: { script: ScriptData }) {
  const router = useRouter()
  const [title, setTitle] = useState(script.title)
  const [titleJa, setTitleJa] = useState(script.title_ja ?? "")
  const [description, setDescription] = useState(script.description ?? "")
  const [author, setAuthor] = useState(script.author ?? "")
  const [playerMin, setPlayerMin] = useState(script.player_count_min ?? 4)
  const [playerMax, setPlayerMax] = useState(script.player_count_max ?? 6)
  const [duration, setDuration] = useState(script.duration_minutes ?? 180)
  const [difficulty, setDifficulty] = useState(script.difficulty ?? "intermediate")
  const [genreTags, setGenreTags] = useState<string[]>(script.genre_tags ?? [])
  const [themeTags, setThemeTags] = useState<string[]>(script.theme_tags ?? [])
  const [contentHtml, setContentHtml] = useState(script.content_html ?? "")
  const [warnings, setWarnings] = useState<string[]>(script.warnings ?? [])
  const [roles, setRoles] = useState<ScriptRole[]>((script.roles as ScriptRole[]) ?? [])
  const [budget, setBudget] = useState(script.budget ?? "")
  const [location, setLocation] = useState(script.location ?? "")
  const [isFeatured, setIsFeatured] = useState(script.is_featured ?? false)
  const [isPlayerVisible, setIsPlayerVisible] = useState(script.is_player_visible ?? false)
  const [isSocialScript, setIsSocialScript] = useState(script.is_social_script ?? false)
  const [showOnPlayerActivity, setShowOnPlayerActivity] = useState(script.show_on_player_activity ?? false)
  const [playerActivityOrder, setPlayerActivityOrder] = useState(script.player_activity_order ?? 0)
  const [pinInSocialLibrary, setPinInSocialLibrary] = useState(script.pin_in_social_library ?? false)
  const [socialLibraryOrder, setSocialLibraryOrder] = useState(script.social_library_order ?? 0)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverExternalUrl, setCoverExternalUrl] = useState("")
  const [coverRemoved, setCoverRemoved] = useState(false)
  const [pageImages, setPageImages] = useState<string[] | null>(script.page_images)
  const [pageImagePaths, setPageImagePaths] = useState<string[] | null>(script.page_image_paths)
  const [pdfStoragePath, setPdfStoragePath] = useState<string | null>(script.pdf_storage_path)
  const [scriptUpdatedAt, setScriptUpdatedAt] = useState(script.updated_at)
  const [protectedUpdatedAt, setProtectedUpdatedAt] = useState<string | null>(script.protected_updated_at)
  const [auditReason, setAuditReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!title.trim()) { setError("请输入剧本标题"); return }
    if (playerMin < 1) { setError("最少人数不能小于 1"); return }
    if (playerMax < playerMin) { setError("最多人数不能小于最少人数"); return }
    if (duration < 1) { setError("时长不能小于 1 分钟"); return }
    setSubmitting(true)
    setError(null)

    try {
      const result = await updateScript(script.id, {
        title, title_ja: titleJa, description, author,
        player_count_min: playerMin, player_count_max: playerMax,
        duration_minutes: duration, difficulty,
        genre_tags: genreTags, theme_tags: themeTags,
        content_html: contentHtml, warnings, roles: JSON.parse(JSON.stringify(roles)),
        is_published: script.is_published ?? false, is_featured: isFeatured,
        is_player_visible: isPlayerVisible,
        budget: budget || null, location: location || null,
        is_social_script: isSocialScript,
        show_on_player_activity: isSocialScript && showOnPlayerActivity,
        player_activity_order: playerActivityOrder,
        pin_in_social_library: isSocialScript && pinInSocialLibrary,
        social_library_order: socialLibraryOrder,
      }, auditReason, {
        scriptUpdatedAt,
        protectedUpdatedAt,
      })

      if (result.error) { setError(result.error); return }
      if (result.updatedAt) setScriptUpdatedAt(result.updatedAt)
      if (result.protectedUpdatedAt) setProtectedUpdatedAt(result.protectedUpdatedAt)

      const uploadErr = await uploadFiles()
      if (uploadErr) { setError(uploadErr); return }
      router.push(`/admin/scripts/${script.id}`)
    } catch (caught) {
      console.error("[ScriptEditForm]", caught)
      setError("网络响应中断，请直接重试；已保存的基本信息不会重复写入。")
    } finally {
      setSubmitting(false)
    }
  }

  async function uploadFiles(): Promise<string | null> {
    if (coverFile) {
      const prepared = await prepareScriptCoverUpload(
        script.id,
        { size: coverFile.size, type: coverFile.type },
        auditReason,
        script.cover_url,
      )
      if (prepared.error || !prepared.path || !prepared.token || !prepared.preparedUpdatedAt) {
        return `封面上传失败: ${prepared.error ?? "无法准备上传"}`
      }
      try {
        const { error: uploadError } = await createClient().storage
          .from(prepared.bucket ?? "scripts-covers")
          .uploadToSignedUrl(prepared.path, prepared.token, coverFile, {
            contentType: coverFile.type,
            cacheControl: "31536000",
          })
        if (uploadError) {
          await discardScriptCoverUpload(script.id, prepared.path, auditReason)
          return `封面上传失败: ${uploadError.message}`
        }
      } catch (caught) {
        console.error("[ScriptEditForm:upload]", caught)
        try { await discardScriptCoverUpload(script.id, prepared.path, auditReason) } catch { /* retry via cleanup outbox */ }
        return "封面上传响应中断，原封面未被覆盖，请重试"
      }
      let res
      try {
        res = await finalizeScriptCoverUpload(
          script.id,
          prepared.path,
          auditReason,
          script.cover_url,
          prepared.preparedUpdatedAt,
        )
      } catch {
        // A lost response can occur after the database commit. Retrying the
        // same path exercises the server-side idempotency check.
        res = await finalizeScriptCoverUpload(
          script.id,
          prepared.path,
          auditReason,
          script.cover_url,
          prepared.preparedUpdatedAt,
        )
      }
      if (res?.error) return `封面上传失败: ${res.error}`
    } else if (coverExternalUrl.trim()) {
      const res = await replaceScriptCoverWithExternalUrl(script.id, coverExternalUrl, auditReason, script.cover_url)
      if (res?.error) return `外部封面保存失败: ${res.error}`
    } else if (coverRemoved) {
      const res = await removeScriptCover(script.id, auditReason, script.cover_url)
      if (res?.error) return `封面删除失败: ${res.error}`
    }
    return null
  }

  return (
    <div className="max-w-lg space-y-5">
      <ScriptEditBasicFields
        title={title} onTitleChange={setTitle}
        titleJa={titleJa} onTitleJaChange={setTitleJa}
        author={author} onAuthorChange={setAuthor}
        description={description} onDescriptionChange={setDescription}
        playerMin={playerMin} onPlayerMinChange={setPlayerMin}
        playerMax={playerMax} onPlayerMaxChange={setPlayerMax}
        duration={duration} onDurationChange={setDuration}
        difficulty={difficulty} onDifficultyChange={setDifficulty}
        genreTags={genreTags} onGenreTagsChange={setGenreTags}
        themeTags={themeTags} onThemeTagsChange={setThemeTags}
        budget={budget} onBudgetChange={setBudget}
        location={location} onLocationChange={setLocation}
        isFeatured={isFeatured} onIsFeaturedChange={setIsFeatured}
      />
      <ScriptContentFields
        contentHtml={contentHtml} onContentHtmlChange={setContentHtml}
        warnings={warnings} onWarningsChange={setWarnings}
        roles={roles} onRolesChange={setRoles}
        coverUrl={coverRemoved || coverExternalUrl ? null : script.cover_url}
        onCoverUpload={(file) => { setCoverFile(file); setCoverExternalUrl(""); setCoverRemoved(false) }}
        coverExternalUrl={coverExternalUrl}
        onCoverExternalUrlChange={(url) => { setCoverExternalUrl(url); if (url) setCoverFile(null); setCoverRemoved(false) }}
        onCoverRemove={() => { setCoverFile(null); setCoverExternalUrl(""); setCoverRemoved(true) }}
        auditReason={auditReason}
        scriptId={script.id}
        existingPages={pageImages}
        existingPagePaths={pageImagePaths}
        existingPdfStoragePath={pdfStoragePath}
        onConverted={(paths, urls, nextProtectedUpdatedAt, nextPdfStoragePath = pdfStoragePath) => {
          setPageImagePaths(paths)
          setPageImages(urls)
          setProtectedUpdatedAt(nextProtectedUpdatedAt)
          setPdfStoragePath(nextPdfStoragePath)
        }}
      />
      <ScriptActivityPlacementFields
        isPlayerVisible={isPlayerVisible}
        onIsPlayerVisibleChange={setIsPlayerVisible}
        isSocialScript={isSocialScript}
        onIsSocialScriptChange={setIsSocialScript}
        showOnPlayerActivity={showOnPlayerActivity}
        onShowOnPlayerActivityChange={setShowOnPlayerActivity}
        playerActivityOrder={playerActivityOrder}
        onPlayerActivityOrderChange={setPlayerActivityOrder}
        pinInSocialLibrary={pinInSocialLibrary}
        onPinInSocialLibraryChange={setPinInSocialLibrary}
        socialLibraryOrder={socialLibraryOrder}
        onSocialLibraryOrderChange={setSocialLibraryOrder}
      />
      <label className="block rounded-xl bg-card p-5 text-sm ring-1 ring-foreground/10">
        <span className="mb-1 block font-medium">本次修改理由（必填）</span>
        <textarea
          value={auditReason}
          onChange={(event) => setAuditReason(event.target.value)}
          minLength={4}
          maxLength={500}
          rows={2}
          placeholder="4–500 字，将写入操作审计"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={submitting || !adminAuditReasonIsValid(auditReason)}>
          {submitting ? "保存中..." : "保存修改"}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
      </div>
    </div>
  )
}
