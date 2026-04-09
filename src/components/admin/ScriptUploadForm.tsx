"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  createScript,
  uploadScriptCover,
} from "@/app/admin/scripts/new/actions"
import { Button } from "@/components/ui/button"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { SingleSelect } from "@/components/shared/SingleSelect"
import { ScriptContentFields } from "@/components/admin/ScriptContentFields"
import { TextInput, NumInput } from "@/components/admin/FormInputs"
import type { ScriptRole } from "@/components/admin/ScriptRoleEditor"
import {
  SCRIPT_GENRE_OPTIONS,
  SCRIPT_THEME_OPTIONS,
  SCRIPT_DIFFICULTY_OPTIONS,
} from "@/lib/constants/scripts"

export function ScriptUploadForm() {
  const router = useRouter()
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!title.trim()) { setError("请输入剧本标题"); return }
    if (playerMin < 1) { setError("最少人数不能小于 1"); return }
    if (playerMax < playerMin) { setError("最多人数不能小于最少人数"); return }
    if (duration < 1) { setError("时长不能小于 1 分钟"); return }
    setSubmitting(true)
    setError(null)

    const result = await createScript({
      title, title_ja: titleJa, description, author,
      player_count_min: playerMin, player_count_max: playerMax,
      duration_minutes: duration, difficulty,
      genre_tags: genreTags, theme_tags: themeTags,
      content_html: contentHtml, warnings, roles,
      is_published: false,
    })

    if (result.error) { setSubmitting(false); setError(result.error); return }

    const scriptId = result.scriptId!
    const uploadErr = await uploadFiles(scriptId)
    setSubmitting(false)
    if (uploadErr) { setError(uploadErr); return }
    router.push("/admin/scripts")
  }

  async function uploadFiles(scriptId: string): Promise<string | null> {
    if (coverFile) {
      const fd = new FormData()
      fd.append("file", coverFile)
      const res = await uploadScriptCover(scriptId, fd)
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
        coverUrl={null} onCoverUpload={setCoverFile}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "保存中..." : "保存剧本"}</Button>
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
      </div>
    </div>
  )
}
