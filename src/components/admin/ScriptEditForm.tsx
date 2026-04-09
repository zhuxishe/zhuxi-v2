"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateScript } from "@/app/admin/scripts/[id]/edit/actions"
import { uploadScriptCover } from "@/app/admin/scripts/new/actions"
import { Button } from "@/components/ui/button"
import { ScriptEditBasicFields } from "@/components/admin/ScriptEditBasicFields"
import { ScriptContentFields } from "@/components/admin/ScriptContentFields"
import type { ScriptRole } from "@/components/admin/ScriptRoleEditor"

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
  is_published: boolean | null
  budget: string | null
  location: string | null
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
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [pageImages, setPageImages] = useState<string[] | null>(script.page_images)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!title.trim()) { setError("请输入剧本标题"); return }
    if (playerMin < 1) { setError("最少人数不能小于 1"); return }
    if (playerMax < playerMin) { setError("最多人数不能小于最少人数"); return }
    if (duration < 1) { setError("时长不能小于 1 分钟"); return }
    setSubmitting(true)
    setError(null)

    const result = await updateScript(script.id, {
      title, title_ja: titleJa, description, author,
      player_count_min: playerMin, player_count_max: playerMax,
      duration_minutes: duration, difficulty,
      genre_tags: genreTags, theme_tags: themeTags,
      content_html: contentHtml, warnings, roles: JSON.parse(JSON.stringify(roles)),
      is_published: script.is_published ?? false,
      budget: budget || null, location: location || null,
    })

    if (result.error) { setSubmitting(false); setError(result.error); return }

    // 上传文件（如果有变更）
    const uploadErr = await uploadFiles()
    setSubmitting(false)
    if (uploadErr) { setError(uploadErr); return }
    router.push(`/admin/scripts/${script.id}`)
  }

  async function uploadFiles(): Promise<string | null> {
    if (coverFile) {
      const fd = new FormData(); fd.append("file", coverFile)
      const res = await uploadScriptCover(script.id, fd)
      if (res?.error) return `封面上传失败: ${res.error}`
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
      />
      <ScriptContentFields
        contentHtml={contentHtml} onContentHtmlChange={setContentHtml}
        warnings={warnings} onWarningsChange={setWarnings}
        roles={roles} onRolesChange={setRoles}
        coverUrl={script.cover_url} onCoverUpload={setCoverFile}
        scriptId={script.id}
        existingPages={pageImages}
        onConverted={setPageImages}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "保存中..." : "保存修改"}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
      </div>
    </div>
  )
}
