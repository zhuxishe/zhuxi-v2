/** Personal profile gender, never this round's preferred partner gender. */
export function memberGenderLabel(value: unknown): string {
  if (value === "male") return "男"
  if (value === "female") return "女"
  if (value === "other") return "其他"
  return "未填写"
}
