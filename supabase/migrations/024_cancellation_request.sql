-- 024: 取消申请字段
ALTER TABLE public.match_results
  ADD COLUMN IF NOT EXISTS cancellation_requested_by text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reviewed_by uuid REFERENCES public.admin_users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_status text DEFAULT NULL
    CHECK (cancellation_status IN ('pending', 'approved', 'rejected'));

-- Index for admin query
CREATE INDEX IF NOT EXISTS idx_match_results_cancellation_status
  ON public.match_results(cancellation_status)
  WHERE cancellation_status IS NOT NULL;
