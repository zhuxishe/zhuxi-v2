-- 021: review 关联 match_result + 防重复提交
-- mutual_reviews 新增 match_result_id 列，支持唯一约束

ALTER TABLE mutual_reviews
  ADD COLUMN match_result_id uuid REFERENCES match_results(id);

-- 防重复：同一个 match_result 同一 reviewer 只能评一次
CREATE UNIQUE INDEX idx_reviews_match_reviewer
  ON mutual_reviews (match_result_id, reviewer_id)
  WHERE match_result_id IS NOT NULL;
