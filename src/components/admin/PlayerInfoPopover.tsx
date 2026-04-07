"use client"

import { Badge } from "@/components/ui/badge"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import type { EnrichedMember } from "./match-detail-types"

interface Props {
  member: EnrichedMember | null
  children: React.ReactNode
}

function getMemberName(m: EnrichedMember | null): string {
  if (!m?.member_identity) return "未知"
  return m.member_identity.full_name ?? m.member_identity.nickname ?? "未知"
}

export function PlayerInfoPopover({ member, children }: Props) {
  if (!member?.member_identity) return <>{children}</>

  const identity = member.member_identity
  const interests = member.member_interests
  const personality = member.member_personality
  const boundaries = member.member_boundaries

  return (
    <Popover>
      <PopoverTrigger className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer">
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="font-bold text-base">{getMemberName(member)}</span>
          <Badge variant="outline" className="text-xs">{identity.gender}</Badge>
        </div>

        {/* Hard constraints */}
        <div className="bg-amber-50 border border-amber-200 rounded-md p-2">
          <div className="text-xs font-semibold text-amber-700 mb-1">硬约束</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>性别: <span className="font-medium">{identity.gender}</span></div>
            <div>性别偏好: <span className="font-medium">{boundaries?.preferred_gender_mix ?? "未设"}</span></div>
            <div>类型偏好: <span className="font-medium">{interests?.game_type_pref ?? "未设"}</span></div>
            {identity.school_name && <div>学校: <span className="font-medium">{identity.school_name}</span></div>}
          </div>
        </div>

        {/* Basic info */}
        <InfoSection title="基本信息" identity={identity} />

        {/* Hobby tags */}
        <TagSection title="兴趣标签" tags={identity.hobby_tags} />

        {/* Social style */}
        {personality && (
          <div className="space-y-1">
            <TagSection title="表达风格" tags={personality.expression_style_tags} />
            <TagSection title="团队角色" tags={personality.group_role_tags} />
            <div className="text-xs text-muted-foreground">
              外向度: {personality.extroversion}/5
              {personality.warmup_speed && ` | 热身速度: ${personality.warmup_speed}`}
            </div>
          </div>
        )}

        {/* Scenario themes */}
        {interests?.scenario_theme_tags && interests.scenario_theme_tags.length > 0 && (
          <TagSection title="剧本偏好" tags={interests.scenario_theme_tags} />
        )}

        {/* Time slots */}
        {interests?.preferred_time_slots && interests.preferred_time_slots.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">偏好时段</div>
            <div className="flex flex-wrap gap-1">
              {interests.preferred_time_slots.map((s) => (
                <Badge key={s} variant="outline" className="text-xs font-normal">{s}</Badge>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function InfoSection({ title, identity }: { title: string; identity: NonNullable<EnrichedMember["member_identity"]> }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{title}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {identity.nationality && <div>国籍: {identity.nationality}</div>}
        {identity.degree_level && <div>学历: {identity.degree_level}</div>}
        {identity.department && <div>学部: {identity.department}</div>}
      </div>
    </div>
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
