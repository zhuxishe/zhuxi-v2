"use client"

import { useTranslations } from "next-intl"
import type { PreInterviewFormData } from "@/types"
import { SchoolSearchSelect } from "@/components/ui/SchoolSearchSelect"
import { MajorSearchSelect } from "@/components/ui/MajorSearchSelect"
import { SingleSelect } from "@/components/shared/SingleSelect"
import { useTagLabels } from "@/lib/i18n/use-tag-labels"
import { COURSE_LANGUAGE_OPTIONS } from "@/lib/constants/tags"

interface Props {
  data: PreInterviewFormData
  onChange: (patch: Partial<PreInterviewFormData>) => void
}

const DEGREE_OPTIONS = [
  "学部生", "修士", "博士", "交换留学", "语言学校", "研究生/预科", "其他",
] as const

const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => String(2020 + i))

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"

export function InterviewStep2({ data, onChange }: Props) {
  const t = useTranslations("interview")
  const degreeLabels = useTagLabels(DEGREE_OPTIONS)
  const courseLangLabels = useTagLabels(COURSE_LANGUAGE_OPTIONS)

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-foreground">{t("school")}</label>
        <SchoolSearchSelect
          className={inputClass}
          value={data.school_name}
          onChange={(v) => onChange({ school_name: v })}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("department")}</label>
        <MajorSearchSelect
          className={inputClass}
          value={data.department}
          onChange={(v) => onChange({ department: v })}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("degreeLevel")}</label>
        <SingleSelect
          options={[...DEGREE_OPTIONS]}
          value={data.degree_level}
          onChange={(v) => onChange({ degree_level: v })}
          labels={degreeLabels}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("courseLanguage")}</label>
        <SingleSelect
          options={[...COURSE_LANGUAGE_OPTIONS]}
          value={data.course_language}
          onChange={(v) => onChange({ course_language: v })}
          labels={courseLangLabels}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">{t("enrollmentYear")}</label>
        <SingleSelect
          options={YEAR_OPTIONS}
          value={data.enrollment_year?.toString() ?? ""}
          onChange={(v) => onChange({ enrollment_year: parseInt(v, 10) })}
        />
      </div>
    </div>
  )
}
