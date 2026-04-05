"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createScript } from "@/app/admin/scripts/new/actions"
import { Button } from "@/components/ui/button"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { SingleSelect } from "@/components/shared/SingleSelect"
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!title.trim()) { setError("请输入剧本标题"); return }
    setSubmitting(true)
    setError(null)

    const result = await createScript({
      title, title_ja: titleJa, description, author,
      player_count_min: playerMin, player_count_max: playerMax,
      duration_minutes: duration, difficulty,
      genre_tags: genreTags, theme_tags: themeTags,
      is_published: false,
    })

    setSubmitting(false)
    if (result.error) setError(result.error)
    else router.push("/admin/scripts")
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">基本信息</h3>
        <Input label="标题 (中文)" value={title} onChange={setTitle} required />
        <Input label="标题 (日文)" value={titleJa} onChange={setTitleJa} />
        <Input label="作者" value={author} onChange={setAuthor} />
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

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "保存中..." : "保存剧本"}</Button>
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
      </div>
    </div>
  )
}

function Input({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div>
      <label className="text-sm font-medium mb-1 block">{label}{required && <span className="text-destructive"> *</span>}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </div>
  )
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1 block">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </div>
  )
}
