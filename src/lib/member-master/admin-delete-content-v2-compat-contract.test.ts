import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const memberMasterMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260829175645_user_member_master_v1.sql",
  ),
  "utf8",
)

const compatibilityMigration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260903094017_fix_admin_delete_admin_user_content_v2_audit_reason.sql",
  ),
  "utf8",
)

function functionBlock(sql: string) {
  const block = sql.match(
    /CREATE OR REPLACE FUNCTION public\.admin_delete_admin_user\([\s\S]*?\n\$function\$;/,
  )?.[0]

  expect(block, "admin_delete_admin_user function must exist").toBeDefined()
  return block ?? ""
}

function stripSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "")
}

function normalizeSql(sql: string) {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim()
}

describe("admin delete Content V2 audit-reason compatibility migration", () => {
  it("is an atomic forward migration with strict dependency and trigger gates", () => {
    const sql = stripSqlComments(compatibilityMigration)

    expect(sql).toContain("SET LOCAL lock_timeout = '5s'")
    expect(sql).toContain("SET LOCAL statement_timeout = '2min'")
    expect(sql).toContain(
      "pg_advisory_xact_lock(hashtextextended('member-master-migration', 0))",
    )
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/)
    expect(sql).toContain(
      "ADMIN_DELETE_CONTENT_V2_PREFLIGHT_DEPENDENCY_MISSING",
    )
    expect(sql).toContain("ADMIN_DELETE_CONTENT_V2_PREFLIGHT_FK_INVALID")
    expect(sql).toContain(
      "ADMIN_DELETE_CONTENT_V2_PREFLIGHT_TRIGGER_INVALID",
    )
    expect(sql).toContain("constraint_info.confdeltype = 'n'")
    expect(sql).toContain("content_v2_10_audit_change")
    expect(sql).toContain("trigger_info.tgtype = 31")
    expect(sql).toContain("content_management_v2_audit_change")
    expect(sql).toContain("ADMIN_DELETE_CONTENT_V2_POSTFLIGHT_RPC_INVALID")
    expect(sql).toContain(
      "ADMIN_DELETE_CONTENT_V2_POSTFLIGHT_TRIGGER_INVALID",
    )
  })

  it("changes only the transaction-local Content V2 reason before deletion", () => {
    const original = functionBlock(memberMasterMigration)
    const repaired = functionBlock(compatibilityMigration)
    const setReason =
      "PERFORM set_config('app.content_v2_audit_reason', btrim(p_reason), true);"
    const repairedWithoutCompatibilityLine = repaired.replace(setReason, "")

    expect(normalizeSql(repairedWithoutCompatibilityLine)).toBe(
      normalizeSql(original),
    )
    expect(repaired.match(/app\.content_v2_audit_reason/g)).toHaveLength(1)
    expect(repaired).toContain(setReason)
    expect(repaired).not.toContain(
      "set_config('app.content_v2_audit_reason', btrim(p_reason), false)",
    )

    const reasonValidation = repaired.indexOf(
      "IF NULLIF(btrim(p_reason), '') IS NULL",
    )
    const auditInsert = repaired.indexOf(
      "INSERT INTO private.admin_user_audit_log",
    )
    const setReasonPosition = repaired.indexOf(setReason)
    const deletePosition = repaired.indexOf(
      "DELETE FROM public.admin_users AS administrator",
    )

    expect(reasonValidation).toBeGreaterThanOrEqual(0)
    expect(auditInsert).toBeGreaterThan(reasonValidation)
    expect(setReasonPosition).toBeGreaterThan(auditInsert)
    expect(deletePosition).toBeGreaterThan(setReasonPosition)
  })

  it("retains SECURITY DEFINER and the authenticated-only RPC ACL", () => {
    const repaired = functionBlock(compatibilityMigration)
    const sql = stripSqlComments(compatibilityMigration)

    expect(repaired).toMatch(
      /RETURNS jsonb\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/,
    )
    expect(sql).not.toMatch(
      /DROP FUNCTION(?: IF EXISTS)? public\.admin_delete_admin_user/i,
    )
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_delete_admin_user\(uuid, text\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    )
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_delete_admin_user\(uuid, text\)\s+TO authenticated;/,
    )
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_delete_admin_user\(uuid, text\)\s+TO (?:PUBLIC|anon|service_role);/i,
    )
    expect(sql).toContain("ADMIN_DELETE_CONTENT_V2_PREFLIGHT_ACL_INVALID")
    expect(sql).toContain("ADMIN_DELETE_CONTENT_V2_POSTFLIGHT_ACL_INVALID")
    expect(sql).toContain(
      "has_function_privilege('service_role', v_rpc, 'EXECUTE')",
    )
  })
})
