"use client"

import { TextInput, NumInput } from "@/components/admin/FormInputs"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { SingleSelect } from "@/components/shared/SingleSelect"
import {
  SCRIPT_GENRE_OPTIONS,
  SCRIPT_THEME_OPTIONS,
  SCRIPT_DIFFICULTY_OPTIONS,
} from "@/lib/constants/scripts"

interface Props {
  title: string; onTitleChange: (v: string) => void
  titleJa: string; onTitleJaChange: (v: string) => void
  author: string; onAuthorChange: (v: string) => void
  description: string; onDescriptionChange: (v: string) => void
  playerMin: number; onPlayerMinChange: (v: number) => void
  playerMax: number; onPlayerMaxChange: (v: number) => void
  duration: number; onDurationChange: (v: number) => void
  difficulty: string; onDifficultyChange: (v: string) => void
  genreTags: string[]; onGenreTagsChange: (v: string[]) => void
  themeTags: string[]; onThemeTagsChange: (v: string[]) => void
  budget: string; onBudgetChange: (v: string) => void
  location: string; onLocationChange: (v: string) => void
  isFeatured: boolean; onIsFeaturedChange: (v: boolean) => void
}

export function ScriptEditBasicFields(props: Props) {
  const diffLabel = SCRIPT_DIFFICULTY_OPTIONS.find((o) => o.value === props.difficulty)?.label ?? ""

  return (
    <>
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">基本信息</h3>
        <TextInput label="标题 (中文)" value={props.title} onChange={props.onTitleChange} required />
        <TextInput label="标题 (日文)" value={props.titleJa} onChange={props.onTitleJaChange} />
        <TextInput label="作者" value={props.author} onChange={props.onAuthorChange} />
        <div>
          <label className="text-sm font-medium mb-1 block">简介</label>
          <textarea value={props.description} onChange={(e) => props.onDescriptionChange(e.target.value)}
            rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">游戏设置</h3>
        <div className="grid grid-cols-3 gap-3">
          <NumInput label="最少人数" value={props.playerMin} onChange={props.onPlayerMinChange} />
          <NumInput label="最多人数" value={props.playerMax} onChange={props.onPlayerMaxChange} />
          <NumInput label="时长(分钟)" value={props.duration} onChange={props.onDurationChange} />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">难度</label>
          <SingleSelect
            options={SCRIPT_DIFFICULTY_OPTIONS.map((o) => o.label)}
            value={diffLabel}
            onChange={(v) => props.onDifficultyChange(
              SCRIPT_DIFFICULTY_OPTIONS.find((o) => o.label === v)?.value ?? "intermediate"
            )}
          />
        </div>
        <TextInput label="预算" value={props.budget} onChange={props.onBudgetChange} />
        <TextInput label="场地" value={props.location} onChange={props.onLocationChange} />
        <label className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-3 text-sm">
          <input
            type="checkbox"
            checked={props.isFeatured}
            onChange={(e) => props.onIsFeaturedChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium">精选活动展示</span>
            <span className="block text-xs text-muted-foreground">勾选后会出现在公开“精选活动”页面。</span>
          </span>
        </label>
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">标签</h3>
        <div>
          <label className="text-sm font-medium mb-2 block">题材</label>
          <MultiTagSelect options={[...SCRIPT_GENRE_OPTIONS]} value={props.genreTags} onChange={props.onGenreTagsChange} />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">主题</label>
          <MultiTagSelect options={[...SCRIPT_THEME_OPTIONS]} value={props.themeTags} onChange={props.onThemeTagsChange} />
        </div>
      </div>
    </>
  )
}
