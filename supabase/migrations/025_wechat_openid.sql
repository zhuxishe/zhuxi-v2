-- 给 members 表添加微信 openid 字段
ALTER TABLE members ADD COLUMN IF NOT EXISTS wechat_openid TEXT UNIQUE;

-- 创建索引加速查找
CREATE INDEX IF NOT EXISTS idx_members_wechat_openid ON members(wechat_openid) WHERE wechat_openid IS NOT NULL;
