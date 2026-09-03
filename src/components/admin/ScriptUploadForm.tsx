"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createScript } from "@/app/admin/scripts/new/actions"
import { uploadScriptCover } from "@/app/admin/scripts/new/upload-actions"
import { Button } from "@/components/ui/button"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { SingleSelect } from "@/components/shared/SingleSelect"
import { ScriptContentFields } from "@/components/admin/ScriptContentFields"
import { ScriptActivityPlacementFields } from "@/components/admin/ScriptActivityPlacementFields"
import { TextInput, NumInput } from "@/components/admin/FormInputs"
import type { ScriptRole } from "@/components/admin/ScriptRoleEditor"
import { adminAuditReasonIsValid } from "@/lib/member-master/audit-reason"
import {
  SCRIPT_GENRE_OPTIONS,
  SCRIPT_THEME_OPTIONS,
  SCRIPT_DIFFICULTY_OPTIONS,
} from "@/lib/constants/scripts"

const SCRIPT_CREATION_REQUEST_KEY = "zhuxishe:admin:new-script-request-id"

export function ScriptUploadForm() {
  const router = useRouter()
  const creationRequestId = useRef<string | null>(null)
  const [title, setTitle] = useState("")
  const [titleJa, setTitleJa] = useState("")
  const [description, setDescription] = useState("")
  const [author, setAuthor] = useState("")
  const [playerMin, setPlayerMin] = useState(4)
  const [playerMax, setPlayerMax] = useState(6)
  const [duration, setDuration] = useState(180)
  const [difficulty, setDifficulty] = useState("intermediate")
  const [genreTags, setGenreTags] = useState<string[]>([])
  const [themeTags, setThemeTags] = useState<string[]>([])
  const [contentHtml, setContentHtml] = useState("")
  const [warnings, setWarnings] = useState<string[]>([])
  const [roles, setRoles] = useState<ScriptRole[]>([])
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverExternalUrl, setCoverExternalUrl] = useState("")
  const [isPlayerVisible, setIsPlayerVisible] = useState(false)
  const [isSocialScript, setIsSocialScript] = useState(false)
  const [showOnPlayerActivity, setShowOnPlayerActivity] = useState(false)
  const [playerActivityOrder, setPlayerActivityOrder] = useState(0)
  const [pinInSocialLibrary, setPinInSocialLibrary] = useState(false)
  const [socialLibraryOrder, setSocialLibraryOrder] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [auditReason, setAuditReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!title.trim()) { setError("请输入剧本标题"); return }
    if (playerMin < 1) { setError("最少人数不能小于 1"); return }
    if (playerMax < playerMin) { setError("最多人数不能小于最少人数"); return }
    if (duration < 1) { setError("时长不能小于 1 分钟"); return }
    setSubmitting(true)
    setError(null)

    creationRequestId.current ??= persistedCreationRequestId()
    let scriptId: string | null = null
    try {
      const result = await createScript({
        request_id: creationRequestId.current,
        title, title_ja: titleJa, description, author,
        cover_url: coverFile ? null : coverExternalUrl.trim() || null,
        player_count_min: playerMin, player_count_max: playerMax,
        duration_minutes: duration, difficulty,
        genre_tags: genreTags, theme_tags: themeTags,
        content_html: contentHtml, warnings, roles,
        is_published: false,
        is_player_visible: isPlayerVisible,
        is_social_script: isSocialScript,
        show_on_player_activity: isSocialScript && showOnPlayerActivity,
        player_activity_order: playerActivityOrder,
        pin_in_social_library: isSocialScript && pinInSocialLibrary,
        social_library_order: socialLibraryOrder,
      }, auditReason)

      if (result.error) {
        setSubmitting(false)
        if (result.scriptId) {
          clearCreationRequestId()
          router.push(`/admin/scripts/${result.scriptId}/edit?notice=protected-save-failed`)
          return
        }
        if (result.error.includes("请求编号")) clearCreationRequestId()
        setError(result.error)
        return
      }

      scriptId = result.scriptId!
      clearCreationRequestId()
      const uploadErr = await uploadFiles(scriptId)
      setSubmitting(false)
      if (uploadErr) {
        router.push(`/admin/scripts/${scriptId}/edit?notice=cover-upload-failed`)
        return
      }
      router.push("/admin/scripts")
    } catch (caught) {
      console.error("[ScriptUploadForm]", caught)
      setSubmitting(false)
      if (scriptId) {
        clearCreationRequestId()
        router.push(`/admin/scripts/${scriptId}/edit?notice=cover-upload-failed`)
      } else {
        setError("网络响应中断。请不要刷新页面，直接再次点击保存；系统会使用同一请求编号避免重复新建。")
      }
    }
  }

  function persistedCreationRequestId() {
    const next = crypto.randomUUID()
    try {
      const existing = sessionStorage.getItem(SCRIPT_CREATION_REQUEST_KEY)
      if (existing) return existing
      sessionStorage.setItem(SCRIPT_CREATION_REQUEST_KEY, next)
    } catch {
      // Browsers may disable sessionStorage; the in-memory ref still prevents
      // duplicate submissions for the lifetime of this form.
    }
    return next
  }

  function clearCreationRequestId() {
    try { sessionStorage.removeItem(SCRIPT_CREATION_REQUEST_KEY) } catch { /* storage unavailable */ }
    creationRequestId.current = null
  }

  async function uploadFiles(scriptId: string): Promise<string | null> {
    if (coverFile) {
      const fd = new FormData()
      fd.append("file", coverFile)
      fd.append("auditReason", auditReason)
      const res = await uploadScriptCover(scriptId, fd, null)
      if (res?.error) return `封面上传失败: ${res.error}`
    }
    return null
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">基本信息</h3>
        <TextInput label="标题 (中文)" value={title} onChange={setTitle} required />
        <TextInput label="标题 (日文)" value={titleJa} onChange={setTitleJa} />
        <TextInput label="作者" value={author} onChange={setAuthor} />
        <div>
          <label className="text-sm font-medium mb-1 block">简介</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">游戏设置</h3>
        <div className="grid grid-cols-3 gap-3">
          <NumInput label="最少人数" value={playerMin} onChange={setPlayerMin} />
          <NumInput label="最多人数" value={playerMax} onChange={setPlayerMax} />
          <NumInput label="时长(分钟)" value={duration} onChange={setDuration} />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">难度</label>
          <SingleSelect
            options={SCRIPT_DIFFICULTY_OPTIONS.map((o) => o.label)}
            value={SCRIPT_DIFFICULTY_OPTIONS.find((o) => o.value === difficulty)?.label ?? ""}
            onChange={(v) => setDifficulty(SCRIPT_DIFFICULTY_OPTIONS.find((o) => o.label === v)?.value ?? "intermediate")}
          />
        </div>
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">标签</h3>
        <div>
          <label className="text-sm font-medium mb-2 block">题材</label>
          <MultiTagSelect options={[...SCRIPT_GENRE_OPTIONS]} value={genreTags} onChange={setGenreTags} />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">主题</label>
          <MultiTagSelect options={[...SCRIPT_THEME_OPTIONS]} value={themeTags} onChange={setThemeTags} />
        </div>
      </div>

      <ScriptContentFields
        contentHtml={contentHtml} onContentHtmlChange={setContentHtml}
        warnings={warnings} onWarningsChange={setWarnings}
        roles={roles} onRolesChange={setRoles}
        coverUrl={null}
        onCoverUpload={(file) => { setCoverFile(file); setCoverExternalUrl("") }}
        coverExternalUrl={coverExternalUrl}
        onCoverExternalUrlChange={(url) => { setCoverExternalUrl(url); if (url) setCoverFile(null) }}
        auditReason={auditReason}
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
        <span className="mb-1 block font-medium">本次新建理由（必填）</span>
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
        <Button onClick={handleSubmit} disabled={submitting || !adminAuditReasonIsValid(auditReason)}>{submitting ? "保存中..." : "保存剧本"}</Button>
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
      </div>
    </div>
  )
}
