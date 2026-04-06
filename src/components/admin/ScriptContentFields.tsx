"use client"

import { ScriptCoverUpload } from "@/components/admin/ScriptCoverUpload"
import { ScriptPdfUpload } from "@/components/admin/ScriptPdfUpload"
import { ScriptRoleEditor, type ScriptRole } from "@/components/admin/ScriptRoleEditor"
import { MultiTagSelect } from "@/components/shared/MultiTagSelect"
import { SCRIPT_WARNING_OPTIONS } from "@/lib/constants/scripts"

interface Props {
  contentHtml: string
  onContentHtmlChange: (v: string) => void
  warnings: string[]
  onWarningsChange: (v: string[]) => void
  roles: ScriptRole[]
  onRolesChange: (v: ScriptRole[]) => void
  coverUrl: string | null
  onCoverUpload: (file: File) => void
  pdfUrl: string | null
  onPdfUpload: (file: File) => void
}

export function ScriptContentFields({
  contentHtml,
  onContentHtmlChange,
  warnings,
  onWarningsChange,
  roles,
  onRolesChange,
  coverUrl,
  onCoverUpload,
  pdfUrl,
  onPdfUpload,
}: Props) {
  return (
    <>
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">活动介绍</h3>
        <div>
          <label className="text-sm font-medium mb-1 block">介绍内容</label>
          <textarea
            value={contentHtml}
            onChange={(e) => onContentHtmlChange(e.target.value)}
            rows={5}
            placeholder="请输入剧本的详细介绍..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">内容警告</h3>
        <MultiTagSelect
          options={[...SCRIPT_WARNING_OPTIONS]}
          value={warnings}
          onChange={onWarningsChange}
        />
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">角色列表</h3>
        <ScriptRoleEditor roles={roles} onChange={onRolesChange} />
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">文件上传</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">封面图</label>
            <ScriptCoverUpload
              coverUrl={coverUrl}
              onUpload={onCoverUpload}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">剧本 PDF</label>
            <ScriptPdfUpload pdfUrl={pdfUrl} onUpload={onPdfUpload} />
          </div>
        </div>
      </div>
    </>
  )
}
