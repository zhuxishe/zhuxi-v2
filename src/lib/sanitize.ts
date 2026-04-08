/**
 * PostgREST 安全工具函数
 * 防止过滤器注入攻击
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 验证 UUID 格式，防止 .or() 中 UUID 拼接注入
 * @throws 如果任何 ID 不是合法 UUID
 */
export function validateUuids(ids: string[]): void {
  for (const id of ids) {
    if (!UUID_RE.test(id)) {
      throw new Error(`Invalid UUID: ${id}`)
    }
  }
}

/**
 * 转义 PostgREST 过滤器中的特殊字符
 * 防止用户输入 `search` 被注入到 .or() 表达式中
 * 移除逗号、括号、点号等可构造过滤器语法的字符
 */
export function sanitizePostgrestValue(value: string): string {
  // 移除 PostgREST 过滤器语法中的特殊字符：
  // , (分隔 or 条件) . (分隔 column.operator.value)
  // ( ) (分组) 反斜杠 (转义)
  return value.replace(/[,.()\\\n\r]/g, "")
}
