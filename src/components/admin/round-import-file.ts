export const ROUND_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024

export function roundImportFileError(file: Pick<File, "name" | "size"> | null | undefined): string | null {
  if (!file) return "请先选择 .xlsx 文件"
  if (!file.name.toLowerCase().endsWith(".xlsx")) return "目前只支持 .xlsx 文件"
  if (file.size > ROUND_IMPORT_MAX_FILE_BYTES) return "Excel 文件不能超过 2 MB；请拆分表格后分别预览并追加导入"
  return null
}
