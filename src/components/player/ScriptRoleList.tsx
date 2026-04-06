interface Role {
  name: string
  gender?: string
  description?: string
}

interface Props {
  roles: Role[] | null
}

const genderLabel: Record<string, string> = {
  male: "男",
  female: "女",
  any: "不限",
}

export function ScriptRoleList({ roles }: Props) {
  if (!roles || roles.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">角色一览</h3>
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
