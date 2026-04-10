"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import type { EnrichedMember } from "./match-detail-types"

function displayGender(g: string | null | undefined): string {
  if (g === "male") return "男"
  if (g === "female") return "女"
  return g || "未知"
}

interface Props {
  member: EnrichedMember | null
  /** 问卷偏好（memberId → {game_type_pref, gender_pref}） */
  submissionPrefs?: Record<string, { game_type_pref: string; gender_pref: string }>
  children: React.ReactNode
}

export function PlayerInfoPopover({ member, submissionPrefs, children }: Props) {
  if (!member?.member_identity) return <>{children}</>

  const identity = member.member_identity
  const interests = member.member_interests
  const personality = member.member_personality
  const subPref = member.id ? submissionPrefs?.[member.id] : undefined

  return (
    <Popover>
      <PopoverTrigger className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer">
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="font-bold text-base">{identity.full_name ?? identity.nickname ?? "未知"}</span>
          <Badge variant="outline" className="text-xs">{displayGender(identity.gender)}</Badge>
        </div>

        {/* 硬约束：只从问卷读取 */}
        <div className="bg-amber-50 border border-amber-200 rounded-md p-2">
          <div className="text-xs font-semibold text-amber-700 mb-1">硬约束（问卷）</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>性别: <span className="font-medium">{displayGender(identity.gender)}</span></div>
            <div>性别偏好: <span className="font-medium">{subPref?.gender_pref ?? "未填问卷"}</span></div>
            <div>类型偏好: <span className="font-medium">{subPref?.game_type_pref ?? "未填问卷"}</span></div>
            {identity.school_name && <div>学校: <span className="font-medium">{identity.school_name}</span></div>}
          </div>
        </div>

        {/* Basic info */}
        <div>
          <div className="text-xs text-muted-foreground mb-1">基本信息</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            {identity.nationality && <div>国籍: {identity.nationality}</div>}
            {identity.department && <div>学部: {identity.department}</div>}
          </div>
        </div>

        {/* Hobby tags */}
        <TagSection title="兴趣标签" tags={identity.hobby_tags} />

        {/* Social style */}
        {personality && (
          <div className="space-y-1">
            <TagSection title="表达风格" tags={personality.expression_style_tags} />
            <TagSection title="团队角色" tags={personality.group_role_tags} />
          </div>
        )}

        <Link
          href={`/admin/members/${member.id}`}
          className="block text-xs text-primary hover:underline text-right mt-1"
        >
          查看详情 →
        </Link>
      </PopoverContent>
    </Popover>
  )
}

function TagSection({ title, tags }: { title: string; tags: string[] }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {tags.length > 0
          ? tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)
          : <span className="text-xs text-muted-foreground">未选</span>
        }
      </div>
    </div>
  )
}
