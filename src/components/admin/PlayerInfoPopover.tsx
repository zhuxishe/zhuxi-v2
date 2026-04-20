"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { displayGender, formatAvailabilityEntries } from "./player-info-format"
import type { EnrichedMember, SubmissionPrefInfo } from "./match-detail-types"
import type { ImportSource } from "@/lib/matching/import-metadata"

function sourceLabel(source: ImportSource) {
  if (source === "legacy-temp") return "老成员补强"
  if (source === "temp") return "纯导入临时成员"
  return "当前正式成员"
}

interface Props {
  member: EnrichedMember | null
  submissionPrefs?: Record<string, SubmissionPrefInfo>
  children: React.ReactNode
}

export function PlayerInfoPopover({ member, submissionPrefs, children }: Props) {
  if (!member?.member_identity) return <>{children}</>

  const identity = member.member_identity
  const personality = member.member_personality
  const subPref = member.id ? submissionPrefs?.[member.id] : undefined
  const availEntries = formatAvailabilityEntries(subPref?.availability)
  const importInfo = member.import_info

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
          <div className="space-y-1 pt-1 border-t border-amber-200/60 text-xs">
            <div className="text-amber-600">可用时段</div>
            {availEntries.length > 0 ? (
              <div className="max-h-28 overflow-auto rounded border border-amber-200/60 bg-white/70 p-1.5">
                <div className="flex flex-wrap gap-1">
                  {availEntries.map((entry) => (
                    <Badge key={entry} variant="outline" className="text-[11px] font-normal">
                      {entry}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-amber-500">未填写</div>
            )}
          </div>
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

        {importInfo && (
          <div className="space-y-1 rounded-md border border-sky-200 bg-sky-50 p-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-sky-700">导入来源</span>
              <Badge variant="outline" className="text-[11px]">
                {sourceLabel(importInfo.source)}
              </Badge>
            </div>
            <div className="text-xs text-sky-900">
              {importInfo.inferred ? "当前库未存导入元数据，此处按导入规则现场推断。" : "以下信息来自导入时保存的元数据。"}
            </div>
            {importInfo.legacy_profile && (
              <div className="space-y-1 text-xs">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {importInfo.legacy_profile.school && <div>老档案学校: {importInfo.legacy_profile.school}</div>}
                  {importInfo.legacy_profile.department && <div>老档案学部: {importInfo.legacy_profile.department}</div>}
                  {importInfo.legacy_profile.game_mode && <div>老档案剧本偏好: {importInfo.legacy_profile.game_mode}</div>}
                  {importInfo.legacy_profile.session_count != null && <div>历史参加: {importInfo.legacy_profile.session_count}</div>}
                  {importInfo.legacy_profile.compatibility_score != null && <div>历史合拍分: {importInfo.legacy_profile.compatibility_score}</div>}
                </div>
                {(importInfo.legacy_profile.interest_tags.length > 0 || importInfo.legacy_profile.social_tags.length > 0) && (
                  <div className="space-y-1">
                    <TagSection title="老档案兴趣标签" tags={importInfo.legacy_profile.interest_tags} />
                    <TagSection title="老档案社交标签" tags={importInfo.legacy_profile.social_tags} />
                  </div>
                )}
              </div>
            )}
            {(importInfo.raw_first_choice || importInfo.raw_second_choice) && (
              <div className="text-xs">
                原始志愿: {importInfo.raw_first_choice || "未记录"}
                {importInfo.raw_second_choice ? ` / ${importInfo.raw_second_choice}` : ""}
              </div>
            )}
            {importInfo.script_activity_pref && (
              <div className="text-xs">社团剧本/活动倾向: {importInfo.script_activity_pref}</div>
            )}
            {importInfo.raw_notes && (
              <div className="text-xs">导入备注: {importInfo.raw_notes}</div>
            )}
            {importInfo.warnings.length > 0 && (
              <div className="text-xs text-amber-700">
                警告: {importInfo.warnings.join("、")}
              </div>
            )}
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
