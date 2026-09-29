# 匹配管理内容编辑增量发布

本次只扩展匹配管理及其 Player 入口：匹配问卷、固定时间报名、活动公告、双语文案、自定义题、实时预览及提交名单。大型活动与其他内容模块不参与。

## 数据库迁移

目标业务项目为 `wjjhprflldvclulistcx`。增量迁移：

`supabase/migrations/20260929120921_matching_content_editor.sql`

- `match_rounds` 增加 `purpose`、`content_config`、`config_revision`；历史轮次默认匹配，配置为空。
- `match_round_submissions` 增加 `custom_answers` 与 `config_revision`；既有答案不重写。
- 提交仍要求已批准且有效的本人会员身份，窗口为 `start <= now < end`。匹配须有共同时间所需的可用时段，报名不收集时间偏好，公告不能提交。
- 自定义题要求稳定的问题/选项 ID，校验必填、题型、选项及大小。答卷产生后锁定用途、日期、固定时间、模块及题目结构；显示文案可修订。
- 配置编辑递增版本，提交使用当前版本；旧页面须刷新后提交。轮次行锁协调提交和结构编辑；非匹配用途无法产生匹配 session。
- 保留原管理员审计、成员锁及系统字段保护；在现有匿名化函数的指定提交清理片段中加入额外答案清空。若基线函数片段不符，整条迁移报错回滚，不能删掉断言后强行执行。

不要从主工作区直接 `db push --include-all`，仓库历史与远端历史存在已记录的映射。先核对项目和已应用基线，再通过现有审核的迁移流程只应用此文件。迁移本身有事务、5 秒锁超时与 2 分钟语句超时；失败应保存错误并检查目标基线，不重放历史迁移。

2026-09-29 已通过本地 Supabase CLI 对正式项目 `wjjhprflldvclulistcx` 应用本次迁移，并在同一事务登记版本 `20260929120921`。执行前核对正式项目、两个基线函数指纹及迁移版本；执行后只读确认五个新增字段、三个相关触发器、本人提交策略、私有函数权限和匿名化补丁均正确，历史记录保存的 SQL 与源文件完全一致。仓库原有 Preview 链接未改变，未执行其他历史迁移或创建测试业务记录。

源文件 SHA-256：`c6cada19aaf8a96ab825093b21770baa143765f8f4a89f75edf249a8f110702b`。CLI 执行指定 SQL 文件不会自动登记迁移历史，因此发布 wrapper 将源 SQL 与 `schema_migrations` 登记放在同一事务中；不能仅凭退出码判定完成，须执行下方只读检查。

未迁移环境仍保留原匹配创建/填写兼容，新内容编辑明确显示“数据库升级尚未完成”；新报名/公告不会静默退化为匹配问卷。

## 应用验证

本地 118 个测试文件、809 项单元测试全部通过，`pnpm lint`、`pnpm typecheck`、`pnpm build` 均通过。隔离浏览器使用真实编辑器及玩家表单组件验证文案即时更新、中日文切换、匹配时段、报名详情、自定义必填题、公告无填写控件和手机布局；预览未发出保存或答卷提交请求。临时验证页面已移除。

本次未在正式环境创建测试会员或提交测试答卷；本地预览和数据库验收不等同于正式登录用户的完整端到端操作验证。

## 独立 PostgreSQL 验证

运行器从仓库读取正式旧表、会员权限辅助函数、原审计理由触发器、旧自助提交策略及最新成员锁函数，再应用本迁移。仅认证 JWT 输入与外围会员基础表通过隔离 fixture 模拟，不替换关键权限函数。测试数据库完全在内存中，无业务连接、无真实成员资料。

```sh
npm install --prefix /private/tmp/zhuxi-matching-sql-check --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
PGLITE_MODULE=/private/tmp/zhuxi-matching-sql-check/node_modules/@electric-sql/pglite/dist/index.js node supabase/audits/matching-content-pglite.mjs
```

当前 52 项覆盖旧匹配、报名免时间、单选/多选/简答、必填、公告拒绝、越界时段、过期/未开始/截止瞬间、版本冲突、结构锁、session 用途、跨会员篡改、匿名/普通管理员/超级管理员/服务角色、管理员兼玩家自助行为、私有函数权限和匿名化答案清除。PGlite 单连接测试不证明两个真实数据库连接并发等待行为；部署前隔离环境还应让答卷提交与编辑同时运行，确认一方等待后读取新版本或结构锁。

## 迁移后检查

用只读 SQL 检查列、策略及触发器实际存在，不能只看 migration 历史版本：

```sql
SELECT table_name, column_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND (
  (table_name = 'match_rounds' AND column_name IN ('purpose','content_config','config_revision'))
  OR (table_name = 'match_round_submissions' AND column_name IN ('custom_answers','config_revision'))
);
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname IN
  ('guard_round_content_write','guard_match_session_round_purpose','member_master_guard_round_submission_write');
SELECT policyname, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='match_round_submissions';
SELECT has_function_privilege('authenticated','private.guard_round_content_write()','EXECUTE') AS must_be_false,
  strpos(pg_get_functiondef('public.admin_anonymize_member(uuid,text)'::regprocedure), 'app.round_anonymize_member') > 0 AS privacy_patch_present;
```

隔离 Preview 用测试会员验证：默认历史匹配不变；新建三用途；编辑与预览同步；报名只确认参加；额外题必填；截止时禁提交；两期并行入口及指定轮次正确；已答卷题目锁定、文字可修订、复制为新草稿；已匹配仍不能重开；普通管理员不获得额外答案权限。复制保留原活动和收集时间，管理员确认新时间后再发布。

若回退应用，不删除新列或清空新数据。已配置新问题或报名/公告的轮次需先关闭并保留记录，再确定兼容版本；旧版本应用无法理解这些用途和配置版本。数据库问题用新的前向迁移修复。
