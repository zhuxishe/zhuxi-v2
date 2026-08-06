import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260806140912_homepage_school_stats_admin.sql"),
  "utf8",
)

function functionBody(name: string) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
  expect(start, `missing SQL function ${name}`).toBeGreaterThanOrEqual(0)
  const end = migration.indexOf("\n$function$;", start)
  expect(end, `unterminated SQL function ${name}`).toBeGreaterThan(start)
  return migration.slice(start, end + "\n$function$;".length)
}

describe("homepage school statistics migration contract", () => {
  it("seeds the exact current public totals without persisting the derived other row", () => {
    const seed = migration.match(
      /VALUES \(\s*1,\s*135,\s*29,\s*'(\[[\s\S]*?\])'::jsonb,\s*1,\s*now\(\)\s*\)/,
    )

    expect(seed, "missing initial homepage school statistics seed").not.toBeNull()
    const schools = JSON.parse(seed?.[1] ?? "[]") as Array<{
      id: string
      zh: string
      ja: string
      count: number
    }>

    expect(schools).toEqual([
      { id: "waseda", zh: "早稻田", ja: "早稲田", count: 44 },
      { id: "todai", zh: "东大", ja: "東大", count: 17 },
      { id: "tus", zh: "东理", ja: "理科大", count: 16 },
      { id: "hosei", zh: "法政", ja: "法政", count: 14 },
      { id: "tokyotech", zh: "东工", ja: "東工", count: 9 },
      { id: "sophia", zh: "上智", ja: "上智", count: 6 },
      { id: "keio", zh: "庆应", ja: "慶應", count: 6 },
    ])
    expect(schools.reduce((sum, school) => sum + school.count, 0)).toBe(112)
    expect(schools.some((school) => school.zh === "其他" || school.ja === "その他")).toBe(false)
    expect(migration).toContain("'seed'")
    expect(migration).toContain("'系统初始配置'")
  })

  it("validates JSON shape before any publish-time array-length access", () => {
    const validator = functionBody("private.homepage_school_stats_featured_schools_valid")
    const publish = functionBody("public.publish_homepage_school_stats")
    const validationCall = publish.indexOf(
      "IF NOT private.homepage_school_stats_featured_schools_valid(",
    )
    const arrayLengthCall = publish.indexOf(
      "IF p_total_schools < jsonb_array_length(p_featured_schools)",
    )
    const validatorTypeCheck = validator.indexOf(
      "IF jsonb_typeof(p_featured_schools) <> 'array'",
    )
    const validatorLengthCheck = validator.indexOf(
      "IF jsonb_array_length(p_featured_schools) > 7",
    )

    expect(validator).toContain("jsonb_typeof(p_featured_schools) <> 'array'")
    expect(validator).toContain("jsonb_array_length(p_featured_schools) > 7")
    expect(validator).toContain("lower(school_id) = 'other'")
    expect(validator).toContain("RETURN total_count <= p_total_members")
    expect(validatorTypeCheck).toBeGreaterThanOrEqual(0)
    expect(validatorLengthCheck).toBeGreaterThan(validatorTypeCheck)
    expect(validationCall).toBeGreaterThanOrEqual(0)
    expect(arrayLengthCall).toBeGreaterThan(validationCall)
    expect(migration).toContain("WHEN jsonb_typeof(featured_schools) = 'array'")
    expect(migration).toContain("homepage_school_stats_history_restore_source")
  })

  it("keeps publish and restore super-admin-only, atomic, and versioned", () => {
    const publish = functionBody("public.publish_homepage_school_stats")
    const restore = functionBody("public.restore_homepage_school_stats")

    for (const body of [publish, restore]) {
      expect(body).toContain("administrator.role = 'super_admin'")
      expect(body).toContain("WHERE id = 1\n  FOR UPDATE")
      expect(body).toContain("HOMEPAGE_SCHOOL_STATS_VERSION_CONFLICT")
      expect(body).toContain("INSERT INTO public.homepage_school_stats_history")
      expect(body).toContain("SECURITY DEFINER\nSET search_path = ''")
      expect(body).toContain("left(")
      expect(body).toContain("120")
    }

    expect(publish).toContain("'publish'")
    expect(restore).toContain("'restore'")
    expect(restore).toContain("source_stats.version")
    expect(restore).toContain("next_version := current_stats.version + 1")
  })

  it("exposes only the current aggregate and revokes every direct write path", () => {
    expect(migration).toContain(
      "ALTER TABLE public.homepage_school_stats ENABLE ROW LEVEL SECURITY",
    )
    expect(migration).toContain(
      "ALTER TABLE public.homepage_school_stats_history ENABLE ROW LEVEL SECURITY",
    )
    expect(migration).toContain("TO anon, authenticated\n  USING (id = 1)")
    expect(migration).toContain(
      "USING ((SELECT private.homepage_school_stats_is_super_admin()))",
    )
    expect(migration).toContain(
      "GRANT SELECT ON TABLE public.homepage_school_stats\n  TO anon, authenticated, service_role",
    )
    expect(migration).toContain(
      "GRANT SELECT ON TABLE public.homepage_school_stats_history\n  TO authenticated, service_role",
    )
    expect(migration).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]*homepage_school_stats/i,
    )
    expect(migration).toContain(
      "REVOKE ALL ON SEQUENCE public.homepage_school_stats_history_id_seq",
    )
  })

  it("locks down every privileged function with a fixed search path", () => {
    const securityDefiners = migration.match(/SECURITY DEFINER/g) ?? []
    const fixedSearchPaths = migration.match(/SECURITY DEFINER\nSET search_path = ''/g) ?? []

    expect(fixedSearchPaths).toHaveLength(securityDefiners.length)
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.publish_homepage_school_stats(integer, integer, jsonb, bigint)\n  FROM PUBLIC, anon, authenticated, service_role",
    )
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.publish_homepage_school_stats(integer, integer, jsonb, bigint)\n  TO authenticated",
    )
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.restore_homepage_school_stats(bigint, bigint)\n  FROM PUBLIC, anon, authenticated, service_role",
    )
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.restore_homepage_school_stats(bigint, bigint)\n  TO authenticated",
    )
  })
})
