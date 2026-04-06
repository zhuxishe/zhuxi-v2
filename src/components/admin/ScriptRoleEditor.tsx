"use client"

import { Button } from "@/components/ui/button"

export interface ScriptRole {
  name: string
  gender: string
  description: string
}

interface Props {
  roles: ScriptRole[]
  onChange: (roles: ScriptRole[]) => void
}

const GENDER_OPTIONS = ["男", "女", "不限"]

export function ScriptRoleEditor({ roles, onChange }: Props) {
  function addRole() {
    onChange([...roles, { name: "", gender: "不限", description: "" }])
  }

  function removeRole(index: number) {
    onChange(roles.filter((_, i) => i !== index))
  }

  function updateRole(index: number, field: keyof ScriptRole, value: string) {
    const updated = roles.map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    )
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      {roles.map((role, i) => (
        <div
          key={i}
          className="flex gap-2 items-start rounded-lg border border-border p-3"
        >
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="角色名"
                value={role.name}
                onChange={(e) => updateRole(i, "name", e.target.value)}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
              />
              <select
                value={role.gender}
                onChange={(e) => updateRole(i, "gender", e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              >
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="角色简介"
              value={role.description}
              onChange={(e) => updateRole(i, "description", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            type="button"
            onClick={() => removeRole(i)}
            className="mt-1 shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="删除角色"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addRole}>
        + 添加角色
      </Button>
    </div>
  )
}
