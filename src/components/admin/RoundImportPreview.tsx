"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { ImportSelfGenderSelect } from "./ImportSelfGenderSelect"
import { LegacyMemberSearchSelect } from "./LegacyMemberSearchSelect"
import type { ImportChoices, ImportFieldChoice, ImportMemberOption, ImportReview, ImportReviewRow, ImportRowChoice } from "@/lib/matching/round-import-contract"

interface Props {
  review: ImportReview
  choices: ImportChoices
  disabled?: boolean
  onChange: (rowNumber: number, choice: ImportRowChoice) => void
}

function memberLabel(member: ImportMemberOption) {
  return [member.full_name || member.nickname || "未填写姓名", member.member_number, member.nickname && member.nickname !== member.full_name ? member.nickname : null].filter(Boolean).join(" · ")
}

export function importValueLabel(value: unknown): string {
  if (value == null || value === "") return "空白"
  if (Array.isArray(value)) return value.length ? value.map(importValueLabel).join("、") : "空白"
  if (typeof value === "object") {
    const entries = Object.entries(value)
    return entries.length ? entries.map(([date, slots]) => `${date} ${importValueLabel(slots)}`).join("；") : "空白"
  }
  return String(value)
}

function IdentityChoice({ row, choice, members, disabled, onChange }: {
  row: ImportReviewRow
  choice: ImportRowChoice
  members: ImportMemberOption[]
  disabled: boolean
  onChange: (choice: ImportRowChoice) => void
}) {
  const [query, setQuery] = useState("")
  const selectedId = choice.target.startsWith("member:") ? choice.target.slice(7) : null
  const mode = selectedId !== null ? "member" : choice.target.startsWith("legacy:") ? "legacy" : choice.target === "new" ? "new" : ""
  const search = query.trim().toLocaleLowerCase()
  const options = members.filter((member) => member.id === selectedId || !search || memberLabel(member).toLocaleLowerCase().includes(search))
  const suggested = members.find((member) => member.id === row.suggestedMemberId)
  return <div className="space-y-2">
    {suggested && <p className="text-muted-foreground">同名建议：{memberLabel(suggested)}。请核对后手动确认，系统不会自动绑定。</p>}
    <label className="block space-y-1">
      <span className="font-medium">确认这一行对应的人</span>
      <select aria-label={`第 ${row.rowNumber} 行身份类型`} value={mode} disabled={disabled} onChange={(event) => {
        onChange({ target: event.target.value === "new" ? "new" : event.target.value === "legacy" ? "legacy:" : event.target.value === "member" ? "member:" : "" })
      }} className="w-full rounded-md border bg-background px-3 py-2">
        <option value="">请选择身份</option>
        <option value="member">选择正式成员或本轮临时成员</option>
        <option value="legacy">使用历史成员资料创建或复用本轮临时成员</option>
        <option value="new">新临时成员</option>
      </select>
    </label>
    {(mode === "member" || mode === "") && <div className="space-y-1">
      <input aria-label={`第 ${row.rowNumber} 行搜索成员`} placeholder="搜索姓名、昵称或会员编号" value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2" />
      <select aria-label={`第 ${row.rowNumber} 行确认成员`} value={selectedId ?? ""} disabled={disabled} onChange={(event) => onChange({ target: event.target.value ? `member:${event.target.value}` : "" })} className="w-full rounded-md border bg-background px-3 py-2">
        <option value="">请手动选择并确认成员</option>
        <optgroup label="正式成员">{options.filter((member) => !member.temporary).map((member) => <option key={member.id} value={member.id}>{memberLabel(member)}</option>)}</optgroup>
        <optgroup label="本轮已有临时成员">{options.filter((member) => member.temporary).map((member) => <option key={member.id} value={member.id}>{memberLabel(member)}</option>)}</optgroup>
      </select>
      {options.length === 0 && <p className="text-muted-foreground">未找到成员，请调整搜索词或选择临时身份。</p>}
    </div>}
  </div>
}

export function RoundImportPreview({ review, choices, disabled = false, onChange }: Props) {
  return <section className="relative z-10 space-y-3 rounded-lg border bg-muted/20 p-3" aria-label="Excel 身份及字段差异预览">
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">确认身份和字段差异</h4>
      <p className="text-xs text-muted-foreground">已有答案默认保留。只有你逐项选择“使用 Excel”，才会更新相应字段；Excel 空白不会清空已有答案。</p>
    </div>
    <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">临时成员可参与后台试算，但未绑定有效线上账户时不能发布匹配通知。选择历史资料只用于本轮临时身份，不会自动绑定线上账户。</div>
    {review.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">{review.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}
    {review.affectedBatchIds.length > 0 && <div className="rounded-md border border-amber-200 px-3 py-2 text-xs text-amber-800">
      <p>以下旧批次使用导入前的资料，输入快照和方案仍会保留；本次只提示资料变化，不改变发布规则。</p>
      <ul className="mt-1 list-disc break-all pl-5">{review.affectedBatchIds.map((id) => <li key={id}>{id}</li>)}</ul>
    </div>}
    <div className="space-y-3">{review.rows.map((row) => {
      const key = String(row.rowNumber)
      const choice = choices[key] ?? { target: "" }
      const legacyId = choice.target.startsWith("legacy:") ? choice.target.slice(7) : null
      const member = review.memberOptions.find((option) => `member:${option.id}` === choice.target)
      const temporary = choice.target === "new" || legacyId !== null || member?.temporary
      return <article key={row.rowNumber} className="space-y-3 rounded-lg border bg-background p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">第 {row.rowNumber} 行 · {row.name}</span>{row.reusedTemporary && <Badge variant="outline">复用本轮临时身份</Badge>}{row.cancelled && <Badge variant="outline">已取消报名</Badge>}</div>
        <IdentityChoice row={row} choice={choice} members={review.memberOptions} disabled={disabled} onChange={(next) => onChange(row.rowNumber, next)} />
        {legacyId !== null && <div className="space-y-1">
          {row.suggestedLegacyIds.length > 0 && <p className="text-muted-foreground">有 {row.suggestedLegacyIds.length} 条同名历史资料，请核对性别、学校、学部后手动选择。</p>}
          <LegacyMemberSearchSelect value={legacyId || null} options={review.legacyOptions} disabled={disabled} onChange={(id) => onChange(row.rowNumber, { ...choice, target: id ? `legacy:${id}` : "legacy:" })} />
        </div>}
        {choice.target === "new" && <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1"><span>本人性别（必填）</span><ImportSelfGenderSelect value={choice.gender ?? null} disabled={disabled} onChange={(gender) => onChange(row.rowNumber, { ...choice, gender: gender ?? undefined })} /></label>
          <label className="space-y-1"><span>本轮临时身份标记</span><input aria-label={`第 ${row.rowNumber} 行临时身份标记`} value={choice.temporaryLabel ?? ""} disabled={disabled} maxLength={80} onChange={(event) => onChange(row.rowNumber, { ...choice, temporaryLabel: event.target.value })} placeholder="同名不同人时填写不同标记；重复导入沿用原标记" className="w-full rounded-md border bg-background px-3 py-2" /></label>
        </div>}
        {temporary && <p className="text-amber-800">本行为临时身份；未绑定有效线上账户时不能发布通知。再次导入同一人时，请选择已有身份或沿用原标记。</p>}
        {row.cancelled && <p className="text-amber-800">本次更新不会恢复已取消的报名。</p>}
        {row.diffs.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-left text-xs"><thead><tr className="border-b"><th className="px-2 py-2 font-medium">字段</th><th className="px-2 py-2 font-medium">当前答案</th><th className="px-2 py-2 font-medium">Excel 内容</th><th className="px-2 py-2 font-medium">本次处理</th></tr></thead><tbody>{row.diffs.map((diff) => {
          const value = choice.fields?.[diff.field] ?? diff.choice
          return <tr key={diff.field} className="border-b last:border-0">
            <th className="px-2 py-2 align-top font-medium">{diff.label}{diff.different && <span className="ml-1 text-amber-800">有差异</span>}</th>
            <td className="max-w-64 whitespace-pre-wrap break-words px-2 py-2 align-top">{importValueLabel(diff.current)}</td>
            <td className="max-w-64 whitespace-pre-wrap break-words px-2 py-2 align-top">{importValueLabel(diff.excel)}{diff.blank && <span className="mt-1 block text-muted-foreground">空白时默认保留已有答案</span>}</td>
            <td className="px-2 py-2 align-top"><select aria-label={`第 ${row.rowNumber} 行${diff.label}处理方式`} value={value} disabled={disabled} onChange={(event) => onChange(row.rowNumber, { ...choice, fields: { ...choice.fields, [diff.field]: event.target.value as ImportFieldChoice } })} className="w-full min-w-32 rounded-md border bg-background px-2 py-2">
              <option value="keep">保留当前</option><option value="excel" disabled={diff.blank}>使用 Excel</option>{diff.nullable && <option value="clear">明确清空</option>}
            </select></td>
          </tr>
        })}</tbody></table></div>}
        {row.errors.length > 0 && <ul className="list-disc space-y-1 pl-5 text-destructive">{row.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>}
        {row.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-amber-800">{row.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>}
      </article>
    })}</div>
  </section>
}
