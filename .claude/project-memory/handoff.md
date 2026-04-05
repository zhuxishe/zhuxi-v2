# Handoff — 竹溪社 V2 项目

## 当前状态
- **全部 7 个 Phase (0-6) 已完成并提交**
- 分支: `claude/affectionate-lumiere` (8 commits, 待合并到 main)
- 28 个路由, tsc 零错误, next build 通过
- 6 个 DB 迁移已部署到 Supabase 东京 (wjjhprflldvclulistcx)

## Git 提交历史
- `a0cbae3` Phase 6: 活动记录/互评/核验/统计
- `39a385b` Phase 5: 剧本库 (PDF预览)
- `40c280c` Phase 4: 匹配系统 (7因子算法)
- `92c4205` Phase 3: 玩家App (补充信息+性格自评)
- `2a683a8` Phase 2: 管理后台 (面试录入)
- `95a4b67` Phase 1: 面试前简表 (公开表单)
- `fbb440a` Phase 0: 项目脚手架
- `2308bd4` 初始化项目指令

## 数据库 (Supabase 东京, 16 张表)
### 核心表
- members (+ user_id, email for magic link auth)
- member_identity, member_language, member_interests
- member_personality, member_boundaries
- member_verification, member_dynamic_stats
- admin_users, interview_evaluations

### 事件表
- match_sessions, match_results, pair_relationships
- activity_records, mutual_reviews, member_notes, scripts

### 辅助
- is_admin() 函数, update_updated_at() 触发器
- update_review_stats() 触发器 (互评→自动更新统计)
- RLS: 玩家只读写自己数据, 管理员全权

## 路由一览
### 公开 (无需登录)
- `/interview-form` — 面试前简表 4步
- `/interview-form/success`

### 管理端 `/admin/*` (需 admin_users 认证)
- 仪表板, 成员管理(列表/详情/面试/统计/核验)
- 匹配管理(列表/新建/结果), 剧本管理(列表/添加/详情)
- 活动记录管理

### 玩家端 `/app/*` (需 magic link 登录 + approved 状态)
- 首页(资料完成度), 补充表单(4步17字段), 性格自评(10维度)
- 匹配结果, 剧本浏览/详情, 互评, 个人统计

## 技术栈
- Next.js 16.1.6 + React 19 + TypeScript 5 + Tailwind 4
- Supabase SSR (@supabase/ssr) + next-intl (zh/ja)
- 匹配算法: 7因子加权 + 贪心+增广+2-opt (从 zhuxi-matching 复制)

## 待办 / 已知问题
1. **Vercel 部署**: 用户需要连接 GitHub 仓库到 Vercel
2. **Supabase Storage**: 需手动创建 "scripts" bucket (剧本PDF/封面存储)
3. **interview_evaluations upsert**: 需给 member_id 加 UNIQUE 约束
4. **Magic link 回调**: 需在 Supabase Auth 设置中配置 Redirect URL
5. **环境变量**: Vercel 需设置 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL
6. **管理员账号**: 需手动在 admin_users 表插入第一个管理员
7. **功能测试**: 全部路由需手动走流程验证

## 服务清单
- GitHub: zhuxisheapp/zhuxi-v2
- Supabase: zhuxishe's Org / wjjhprflldvclulistcx (东京)
- Vercel: 待连接
