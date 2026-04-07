"use client"

import { useTranslations } from "next-intl"

interface Role {
  name: string
  gender?: string
  description?: string
}

interface Props {
  roles: Role[] | null
}

export function ScriptRoleList({ roles }: Props) {
  const t = useTranslations("scriptDetail")

  const genderLabel: Record<string, string> = {
    male: t("genderMale"),
    female: t("genderFemale"),
    any: t("genderAny"),
  }

  if (!roles || roles.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("roles")}</h3>
      <div className="space-y-1.5">
        {roles.map((role, i) => (
          <div
            key={i}
            className="rounded-lg ring-1 ring-foreground/10 p-3 text-sm"
          >
            <span className="font-medium">{role.name}</span>
            {role.gender && (
              <span className="ml-1.5 text-muted-foreground">
                ({genderLabel[role.gender] ?? role.gender})
              </span>
            )}
            {role.description && (
              <span className="ml-1.5 text-muted-foreground">
                - {role.description}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
