"use client"

import type { DragEvent } from "react"
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { HomepageFeaturedSchoolDraft } from "./types"

interface Props {
  school: HomepageFeaturedSchoolDraft
  index: number
  total: number
  pending: boolean
  invalidFields: { zh: boolean; ja: boolean; count: boolean }
  onChange: (patch: Partial<HomepageFeaturedSchoolDraft>) => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

const INPUT_CLASS = "min-h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-60"

export function HomepageSchoolRow({
  school,
  index,
  total,
  pending,
  invalidFields,
  onChange,
  onMove,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const number = index + 1

  return (
    <article
      className="rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/25"
      onDragOver={onDragOver}
      onDrop={onDrop}
      aria-labelledby={`homepage-school-${school.id}-title`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            draggable={!pending}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            aria-hidden="true"
            title="拖动排序"
            className="grid size-9 shrink-0 cursor-grab place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 id={`homepage-school-${school.id}-title`} className="text-sm font-semibold text-foreground">
              精选学校 {number}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {school.zh.trim() || school.ja.trim() || "尚未命名"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={pending || index === 0}
            onClick={() => onMove(-1)}
            aria-label={`将${school.zh.trim() || `第 ${number} 所学校`}上移`}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={pending || index === total - 1}
            onClick={() => onMove(1)}
            aria-label={`将${school.zh.trim() || `第 ${number} 所学校`}下移`}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            disabled={pending}
            onClick={onDelete}
            aria-label={`删除${school.zh.trim() || `第 ${number} 所学校`}`}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
        <label htmlFor={`homepage-school-${school.id}-zh`}>
          <span className="mb-1.5 block text-sm font-medium text-foreground">中文名称</span>
          <input
            id={`homepage-school-${school.id}-zh`}
            value={school.zh}
            maxLength={40}
            autoComplete="off"
            disabled={pending}
            onChange={(event) => onChange({ zh: event.target.value })}
            aria-invalid={invalidFields.zh}
            aria-errormessage={invalidFields.zh ? "homepage-validation-errors" : undefined}
            className={INPUT_CLASS}
            placeholder="例如：早稻田"
          />
        </label>
        <label htmlFor={`homepage-school-${school.id}-ja`}>
          <span className="mb-1.5 block text-sm font-medium text-foreground">日文名称</span>
          <input
            id={`homepage-school-${school.id}-ja`}
            value={school.ja}
            maxLength={40}
            lang="ja"
            autoComplete="off"
            disabled={pending}
            onChange={(event) => onChange({ ja: event.target.value })}
            aria-invalid={invalidFields.ja}
            aria-errormessage={invalidFields.ja ? "homepage-validation-errors" : undefined}
            className={INPUT_CLASS}
            placeholder="例：早稲田"
          />
        </label>
        <label htmlFor={`homepage-school-${school.id}-count`}>
          <span className="mb-1.5 block text-sm font-medium text-foreground">人数</span>
          <input
            id={`homepage-school-${school.id}-count`}
            type="number"
            min={0}
            max={2147483647}
            step={1}
            inputMode="numeric"
            value={Number.isNaN(school.count) ? "" : school.count}
            disabled={pending}
            onChange={(event) => onChange({ count: event.currentTarget.valueAsNumber })}
            aria-invalid={invalidFields.count}
            aria-errormessage={invalidFields.count ? "homepage-validation-errors" : undefined}
            className={INPUT_CLASS}
          />
        </label>
      </div>
    </article>
  )
}
