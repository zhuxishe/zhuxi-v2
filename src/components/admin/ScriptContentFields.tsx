"use client"

import { ScriptCoverUpload } from "@/components/admin/ScriptCoverUpload"
import { ScriptPdfConverter } from "@/components/admin/ScriptPdfConverter"
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
  coverExternalUrl: string
  onCoverExternalUrlChange: (url: string) => void
  onCoverRemove?: () => void
  auditReason: string
  /** Edit mode: scriptId available for PDF conversion */
  scriptId?: string
  existingPages?: string[] | null
  existingPagePaths?: string[] | null
  existingPdfStoragePath?: string | null
  onConverted?: (
    paths: string[],
    previewUrls: string[],
    protectedUpdatedAt: string | null,
    pdfStoragePath?: string | null,
  ) => void
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
  coverExternalUrl,
  onCoverExternalUrlChange,
  onCoverRemove,
  auditReason,
  scriptId,
  existingPages,
  existingPagePaths,
  existingPdfStoragePath,
  onConverted,
}: Props) {
  return (
    <>
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">完整剧本内容（受保护）</h3>
        <div>
          <label className="text-sm font-medium mb-1 block">正文内容</label>
          <textarea
            value={contentHtml}
            onChange={(e) => onContentHtmlChange(e.target.value)}
            rows={5}
            placeholder="仅获授权且未过期的玩家可以查看..."
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
        <h3 className="text-sm font-semibold">角色列表（受保护）</h3>
        <ScriptRoleEditor roles={roles} onChange={onRolesChange} />
      </div>

      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 space-y-4">
        <h3 className="text-sm font-semibold">文件上传</h3>
        <div>
          <label className="text-sm font-medium mb-2 block">封面图</label>
          <ScriptCoverUpload
            coverUrl={coverUrl}
            onUpload={onCoverUpload}
            externalUrl={coverExternalUrl}
            onExternalUrlChange={onCoverExternalUrlChange}
            onRemove={onCoverRemove}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">剧本内容</label>
          {scriptId && onConverted ? (
            <ScriptPdfConverter
              scriptId={scriptId}
              existingPages={existingPages ?? null}
              existingPagePaths={existingPagePaths ?? null}
              existingPdfStoragePath={existingPdfStoragePath ?? null}
              auditReason={auditReason}
              onConverted={onConverted}
            />
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">
              请先保存基本信息，再上传剧本内容
            </p>
          )}
        </div>
      </div>
    </>
  )
}
