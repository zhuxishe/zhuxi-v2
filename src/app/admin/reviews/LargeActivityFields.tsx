"use client"

import type { ReviewInput } from "./actions"
import type { PastEventReview } from "@/lib/queries/past-event-reviews"
import {
  formatTokyoDateTimeLocal,
  parseTokyoDateTimeLocal,
} from "@/lib/player-activity/tokyo-datetime"

export const activityInputClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

export function reviewInputFromFormData(formData: FormData): ReviewInput {
  return {
    title: text(formData, "title"),
    title_ja: text(formData, "title_ja"),
    summary: text(formData, "summary") ?? "",
    summary_ja: text(formData, "summary_ja"),
    content: text(formData, "content"),
    content_ja: text(formData, "content_ja"),
    tags: splitValues(formData.get("tags")),
    cover_url: text(formData, "cover_url"),
    gallery_urls: splitValues(formData.get("gallery_urls")),
    source_url: text(formData, "source_url"),
    event_date: text(formData, "event_date"),
    start_at: parseTokyoDateTimeLocal(text(formData, "start_at")),
    end_at: parseTokyoDateTimeLocal(text(formData, "end_at")),
    location: text(formData, "location"),
    location_ja: text(formData, "location_ja"),
    fee_note: text(formData, "fee_note"),
    fee_note_ja: text(formData, "fee_note_ja"),
    capacity_note: text(formData, "capacity_note"),
    capacity_note_ja: text(formData, "capacity_note_ja"),
    registration_url: text(formData, "registration_url"),
    status: (text(formData, "status") || "draft") as ReviewInput["status"],
    is_published: formData.get("is_published") === "on",
    sort_order: numberValue(formData, "sort_order"),
    show_on_player_home: formData.get("show_on_player_home") === "on",
    player_home_order: numberValue(formData, "player_home_order"),
    pin_in_player_library: formData.get("pin_in_player_library") === "on",
    player_library_order: numberValue(formData, "player_library_order"),
  }
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim()
}

function numberValue(formData: FormData, key: string) {
  const value = Number(formData.get(key) ?? 0)
  return Number.isFinite(value) ? value : 0
}

function splitValues(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function LargeActivityFields({ item }: { item?: PastEventReview }) {
  const status = item
    ? item.status ?? (item.is_published === false ? "draft" : "published")
    : "draft"

  return (
    <div className="space-y-5">
      <FieldSection title="基本信息">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="标题（中文）" required><input name="title" required defaultValue={item?.title ?? ""} className={activityInputClass} /></Field>
          <Field label="标题（日文）"><input name="title_ja" defaultValue={item?.title_ja ?? ""} className={activityInputClass} /></Field>
          <Field label="简介（中文）" className="sm:col-span-2"><textarea name="summary" required defaultValue={item?.summary ?? ""} rows={3} className={activityInputClass} /></Field>
          <Field label="简介（日文）" className="sm:col-span-2"><textarea name="summary_ja" defaultValue={item?.summary_ja ?? ""} rows={3} className={activityInputClass} /></Field>
          <Field label="详细内容（中文）" className="sm:col-span-2"><textarea name="content" defaultValue={item?.content ?? ""} rows={5} className={activityInputClass} /></Field>
          <Field label="详细内容（日文）" className="sm:col-span-2"><textarea name="content_ja" defaultValue={item?.content_ja ?? ""} rows={5} className={activityInputClass} /></Field>
          <Field label="标签" hint="使用逗号或换行分隔" className="sm:col-span-2"><input name="tags" defaultValue={(item?.tags ?? []).join("，")} className={activityInputClass} /></Field>
        </div>
      </FieldSection>

      <FieldSection title="时间与参加信息">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="开始时间（日本时间）"><input name="start_at" type="datetime-local" defaultValue={formatTokyoDateTimeLocal(item?.start_at)} className={activityInputClass} /></Field>
          <Field label="结束时间（日本时间）"><input name="end_at" type="datetime-local" defaultValue={formatTokyoDateTimeLocal(item?.end_at)} className={activityInputClass} /></Field>
          <Field label="官网兼容日期" hint="官网往期回顾仍用此日期排序"><input name="event_date" type="date" defaultValue={item?.event_date ?? ""} className={activityInputClass} /></Field>
          <Field label="报名链接"><input name="registration_url" type="url" defaultValue={item?.registration_url ?? ""} className={activityInputClass} /></Field>
          <Field label="地点（中文）"><input name="location" defaultValue={item?.location ?? ""} className={activityInputClass} /></Field>
          <Field label="地点（日文）"><input name="location_ja" defaultValue={item?.location_ja ?? ""} className={activityInputClass} /></Field>
          <Field label="费用说明（中文）"><input name="fee_note" defaultValue={item?.fee_note ?? ""} className={activityInputClass} /></Field>
          <Field label="费用说明（日文）"><input name="fee_note_ja" defaultValue={item?.fee_note_ja ?? ""} className={activityInputClass} /></Field>
          <Field label="人数说明（中文）"><input name="capacity_note" defaultValue={item?.capacity_note ?? ""} className={activityInputClass} /></Field>
          <Field label="人数说明（日文）"><input name="capacity_note_ja" defaultValue={item?.capacity_note_ja ?? ""} className={activityInputClass} /></Field>
        </div>
      </FieldSection>

      <FieldSection title="图片与来源">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="封面图 URL" required className="sm:col-span-2"><input name="cover_url" required defaultValue={item?.cover_url ?? ""} className={activityInputClass} /></Field>
          <Field label="更多图片 URL" hint="每行一个" className="sm:col-span-2"><textarea name="gallery_urls" defaultValue={(item?.gallery_urls ?? []).join("\n")} rows={3} className={activityInputClass} /></Field>
          <Field label="来源链接" className="sm:col-span-2"><input name="source_url" type="url" defaultValue={item?.source_url ?? ""} className={activityInputClass} /></Field>
        </div>
      </FieldSection>

      <FieldSection title="发布与 Player 展示">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="状态">
            <select name="status" defaultValue={status} className={activityInputClass}>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="cancelled">已取消</option>
            </select>
          </Field>
          {item?.source_key && (
            <Field label="静态来源键" hint="系统迁移标识，仅供识别，不可修改">
              <code className="rounded-lg border border-border bg-muted px-3 py-2 text-sm font-normal text-muted-foreground">
                {item.source_key}
              </code>
            </Field>
          )}
          <Field label="官网排序"><input name="sort_order" type="number" defaultValue={item?.sort_order ?? 0} className={activityInputClass} /></Field>
          <Field label="活动父菜单排序"><input name="player_home_order" type="number" defaultValue={item?.player_home_order ?? 0} className={activityInputClass} /></Field>
          <Field label="大型活动库排序"><input name="player_library_order" type="number" defaultValue={item?.player_library_order ?? 0} className={activityInputClass} /></Field>
          <div className="flex flex-col justify-end gap-2">
            <Checkbox name="show_on_player_home" defaultChecked={item?.show_on_player_home ?? false} label="在活动父菜单展示" />
            <Checkbox name="pin_in_player_library" defaultChecked={item?.pin_in_player_library ?? false} label="在大型活动库置顶" />
            <Checkbox name="is_published" defaultChecked={item?.is_published ?? false} label="同时在官网往期回顾展示" />
          </div>
        </div>
      </FieldSection>
    </div>
  )
}

function FieldSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h3 className="text-sm font-semibold">{title}</h3>{children}</section>
}

function Field({ label, hint, required, className, children }: { label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={`grid gap-1 text-xs font-medium ${className ?? ""}`}>
      <span>{label}{required ? " *" : ""}</span>
      {children}
      {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
    </label>
  )
}

function Checkbox({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return <label className="flex items-center gap-2 text-sm"><input name={name} type="checkbox" defaultChecked={defaultChecked} className="size-4 accent-primary" />{label}</label>
}
