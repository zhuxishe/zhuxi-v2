# 会话交接 — 2026-04-06

## 当前状态
- **主分支 main** commit `662dea6`，已推送 GitHub，Vercel 自动部署中
- Supabase 东京 (wjjhprflldvclulistcx)，已应用 12 个迁移
- Vercel: zhuxi-v2.vercel.app

## 本次会话完成的工作

### 管理员系统修复
- 白名单 CRUD 切换到 service role client（绕过 RLS）
- 管理员独立登录（不走 Google OAuth）

### 玩家首页优化
- 最近车站 → 可搜索下拉菜单（`StationSearchSelect` + `stations.json` 101站）
- 活动人数加 "2人"、"3-4人"
- 个人边界从首页移除（无对应表单），分类 5→3
- 语言+活动偏好合并为"补充信息"

### 管理后台 — 详情页重构
- 6 分区布局：基本信息 / 面试评估(amber) / 补充信息(violet) / 性格评价(blue) / 个人边界(rose) / 验证状态(primary)
- 展示成员所有字段（identity + language + interests + personality + boundaries + verification）
- 面试评估用 `EvalTabView` 组件：多面试官 tab 切换 + 平均值

### 管理后台 — 编辑页新增
- 与详情页同布局 6 分区
- 5 个子表（identity/language/interests/personality/boundaries）可编辑
- 标签可编辑（hobby/activity_type/personality_self/taboo）
- 面试评估 + 验证状态只读

### 多面试官支持
- DB: (member_id, interviewer_id) 联合唯一键
- interviewer_name 冗余存储（PostgREST 嵌套 join 不可靠）
- attractiveness_score 存入 interview_evaluations + members 两表
- 标签统一为"颜值"

## 已应用的 DB Migrations
- `010_multi_interviewer.sql` — 去 member_id UNIQUE，加联合唯一
- `011_eval_interviewer_name.sql` — 加 interviewer_name 列
- `012_eval_attractiveness.sql` — 加 attractiveness_score 列

## 未验证 / 需要测试
- **成员详情页能否打开**（去掉嵌套 join 后理论修复，用户未确认）
- **面试评估显示**（颜值评分改完后未测试）
- **多面试官 tab 切换**（只有一个管理员测试过）
- **编辑页标签编辑功能**
- **整体端到端流程**

## 关键决策
- PostgREST 嵌套 join → 冗余 interviewer_name（可靠性优先）
- attractiveness_score 双写（members + interview_evaluations）
- 详情/编辑页统一 6 分区布局

## 关键文件
- 详情页: `src/components/admin/MemberDetailCard.tsx`
- 编辑页: `src/components/admin/MemberEditForm.tsx` + `MemberEdit*.tsx`
- 面试 Tab: `src/components/admin/EvalTabView.tsx`
- 面试表单: `src/components/admin/InterviewEvalForm.tsx`
- 面试 action: `src/app/admin/members/[id]/interview/actions.ts`
- 成员查询: `src/lib/queries/members.ts`
- 评估维度: `src/lib/constants/interview.ts`

## 服务清单
- GitHub: zhuxisheapp/zhuxi-v2
- Supabase: wjjhprflldvclulistcx (东京)
- Vercel: zhuxi-v2.vercel.app
