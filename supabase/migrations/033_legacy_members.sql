-- 旧成员数据表（独立于主 members 表，通过认领机制关联）
CREATE TABLE legacy_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_no text NOT NULL UNIQUE,           -- "No.001"
  full_name text NOT NULL,
  gender text,                              -- "男"/"女"
  school text,
  department text,
  interest_tags text[] DEFAULT '{}',
  social_tags text[] DEFAULT '{}',
  game_mode text,
  compatibility_score numeric,
  session_count int DEFAULT 0,
  match_history jsonb DEFAULT '[]',         -- [{name, count}]
  -- 认领状态
  claim_status text NOT NULL DEFAULT 'unclaimed'
    CHECK (claim_status IN ('unclaimed','pending','approved','rejected')),
  claimed_by uuid REFERENCES members(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_legacy_members_claim_status ON legacy_members (claim_status);
CREATE INDEX idx_legacy_members_claimed_by ON legacy_members (claimed_by) WHERE claimed_by IS NOT NULL;

-- RLS
ALTER TABLE legacy_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_legacy_members" ON legacy_members FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "authenticated_read_legacy_members" ON legacy_members FOR SELECT
  USING (auth.uid() IS NOT NULL);
