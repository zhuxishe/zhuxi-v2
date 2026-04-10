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

/** 将 availability 对象压缩为可读字符串 */
function formatAvailability(avail?: Record<string, string[]>): string | null {
  if (!avail) return null
  const entries = Object.entries(avail).filter(([, v]) => v.length > 0)
  if (entries.length === 0) return null
  // 只显示前3个日期
  const display = entries.slice(0, 3).map(([date, slots]) => {
    const short = date.replace(/^\d{4}-/, "")  // "04-12"
    return `${short} ${slots.join(",")}`
  })
  const suffix = entries.length > 3 ? ` +${entries.length - 3}天` : ""
  return display.join(" · ") + suffix
}

interface Props {
  member: EnrichedMember | null
  /** 问卷偏好（memberId → {game_type_pref, gender_pref, availability?, interest_tags?, social_style?}） */
  submissionPrefs?: Record<string, {
    game_type_pref: string; gender_pref: string
    availability?: Record<string, string[]>; interest_tags?: string[]; social_style?: string | null
  }>
  children: React.ReactNode
}

export function PlayerInfoPopover({ member, submissionPrefs, children }: Props) {
  if (!member?.member_identity) return <>{children}</>

  const identity = member.member_identity
  const personality = member.member_personality
  const subPref = member.id ? submissionPrefs?.[member.id] : undefined
  const availText = formatAvailability(subPref?.availability)

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
        <div className="bg-amber-50 border border-amber-200 rounded-md p-2 space-y-1.5">
          <div className="text-xs font-semibold text-amber-700">硬约束（问卷）</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>性别: <span className="font-medium">{displayGender(identity.gender)}</span></div>
            <div>性别偏好: <span className="font-medium">{subPref?.gender_pref ?? "未填问卷"}</span></div>
            <div>类型偏好: <span className="font-medium">{subPref?.game_type_pref ?? "未填问卷"}</span></div>
            {identity.school_name && <div>学校: <span className="font-medium">{identity.school_name}</span></div>}
          </div>
          {/* 可用时段 */}
          {availText && (
            <div className="text-xs pt-1 border-t border-amber-200/60">
              <span className="text-amber-600">可用时段:</span>{" "}
              <span className="font-medium">{availText}</span>
            </div>
          )}
          {!subPref?.availability && subPref && (
            <div className="text-xs pt-1 border-t border-amber-200/60 text-amber-500">可用时段: 未填写</div>
          )}
        </div>

        {/* 本轮问卷偏好 */}
        {subPref?.interest_tags && subPref.interest_tags.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground">题材偏好（问卷）</div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {subPref.interest_tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
            </div>
          </div>
        )}

        {subPref?.social_style && (
          <div className="text-xs">
            <span className="text-muted-foreground">社交风格:</span>{" "}
            <span className="font-medium">{subPref.social_style}</span>
          </div>
        )}

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
