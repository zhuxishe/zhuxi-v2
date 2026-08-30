# 用户与成员主档案 v1：数据契约与发布手册

## 不变量

- `public.members.id` 是永久业务主键，也是 `/admin/members/[id]` 的路由 ID。
- `public.members.user_id` 只用于一对一关联 `auth.users.id`；禁止按邮箱、姓名自动绑定或合并。
- 一个自然人只有一个主档案，但可通过角色分配拥有 user、member、staff、admin 等多种职责。
- 账号、资料和审批是三条独立状态轴：
  - `account_status`: `unbound | active | suspended | closed`
  - `profile_stage`: `not_started | in_progress | submitted | complete`
  - `status`（既有审批状态）: `pending | approved | rejected | inactive`
- 旧成员、导入成员和未绑定账号的档案继续保留；疑似重复项只进入人工候选队列。
- 匿名社区作者映射不进入普通目录、360° 详情、搜索或统计。揭示必须由超级管理员针对有效举报填写理由，且产生审计事件。
- 审计事件只追加，不覆盖、不删除。恢复旧值等同一次新的、可追踪的修改。
- 匿名化后的主记录继续保留 canonical `members.id`，但解除 `user_id`、清除业务 PII，并以私有 Auth tombstone 阻止旧 JWT 重新创建第二条主记录；正常后台 RPC 不再返回该成员历史审计中的旧 PII。

## 权限边界

| 能力 | `admin` | `super_admin` |
|---|---:|---:|
| 查看非匿名 360° 档案 | 是 | 是 |
| 修改基本资料、申请、面试与日常运营字段 | 是，必须填写理由 | 是，必须填写理由 |
| 覆盖原始问卷、会员编号和账号生命周期 | 否 | 是，必须填写理由 |
| 绑定/解绑/合并账号 | 否 | 是，必须预检并审计 |
| 恢复审计事件 | 否 | 是，恢复本身新增事件 |
| 揭示被举报匿名内容的作者 | 否 | 是，需有效举报与理由 |
| 匿名化或硬删除预检 | 否 | 是 |

后台对两种角色统一显示为管理员；以上边界由数据库 RPC 再次验证，不能只依赖按钮显隐。

## 首次登录与分步保存

1. OAuth、邮箱确认或直接进入 `/app` 后，服务端幂等调用 `ensure_my_member_record()`。
2. 该调用只为当前 `auth.uid()` 创建安全默认主档案，不能提交审批结果、会员编号或其他人的 ID。
3. 初次表单的四个“下一步”分别调用 `save_my_onboarding_step()`；每一步独立事务保存。
4. 最后一页调用 `submit_my_onboarding()`；数据库完整校验通过后，才将资料标记为已提交并进入待审批。
5. 保存失败停留在当前步骤，之前成功保存的数据不回滚、不丢失。

## 旧成员与导入数据

- 每一行 `legacy_members` 都必须关联一个 `canonical_member_id`。已有有效 `claimed_by` 时沿用该成员；未认领记录创建 `record_source = 'legacy'`、`account_status = 'unbound'` 的账号外壳。
- 后续出现与既有外壳冲突的认领只创建人工重复候选，不能自动改指、合并或遗留无来源外壳。
- 旧档案原始字段只允许超级管理员读取；普通管理员在 360° 中只看去标识后的业务摘要。
- 超级管理员在 360° 中通过 `admin_upsert_legacy_member()` 修改 legacy 业务原始字段，并必须填写 4–500 字理由。authenticated 对基表的直接 INSERT/UPDATE/DELETE 均已撤销；`id`、canonical/认领关联、审核操作者与技术时间不可由客户端覆盖，认领审核人和审核时间由 RPC 自动维护。
- 不提供 legacy 硬删除 RPC：原始来源与 canonical 外壳必须保留，避免删除来源后留下无依据的主档案。需要纠正认领结论时使用状态、重复候选和专用关联流程。
- Excel 临时成员导入只允许超级管理员，必须填写 4–500 字理由。当前批量 service-role 写入与 authenticated 审计 RPC 无法组成同一事务；每条事件会标记 `atomic_with_service_write = false`，任何审计或补偿失败都必须作为失败返回并人工核对。

## 日常运营记录审计

- 以下 12 类成员关联运营数据的管理员 INSERT/UPDATE/DELETE 必须携带 4–500 字真人理由：动态统计、成员备注、互评、活动、匹配结果、两人关系、匹配会话、轮次问卷、玩家反馈、剧本阅读记录、Staff 资料、未匹配诊断。
- `audit_reason` 是瞬时传输列：数据库触发器把它转入 transaction-local setting 后立即清空，业务行不会重复保存理由。
- 没有 canonical 成员主体的运营写入（例如未绑定 Staff、空成员活动或初建匹配会话）写入 `private.subjectless_operational_audit_log`。该表只保存实际变化的紧凑业务字段及记录定位、原因、来源、操作者快照和时间；只追加、service-role 只读，不会与成员审计重复。
- 管理员删除活动使用 `admin_delete_activity_record()`；其他受支持的运营删除使用 `admin_delete_operational_record()`。禁止从后台直接 DELETE 以绕过理由与成员审计。
- 原始轮次问卷只有超级管理员可以在后台查看、覆盖或删除；普通管理员只能看到“已提交”的去敏历史。玩家只能在问卷开放时间内读取、创建或修改自己的提交，不能直接 DELETE，也不能改写 ID、成员/轮次外键、导入元数据或技术时间。
- 公开 Staff 区块只读取 `published_staff_profiles` 安全视图；`staff_profiles.member_id` 与 `audit_reason` 不授予匿名或普通认证客户端读取。
- service-role 的既有系统流程若未提供理由，数据库记录紧凑且确定性的系统原因；它不冒充真人管理员理由。

## 管理员管理

- `admin` 与 `super_admin` 在普通后台身份展示中都显示为“管理员”；只有超级管理员能进入管理员白名单管理。
- 新增白名单、修改角色和删除管理员均通过窄 RPC 完成，必须填写 4–500 字理由并写入独立 append-only 审计。
- 三个 RPC 在同一事务 advisory lock 内检查“至少保留一位已绑定超级管理员”，并禁止超级管理员自降级或自删除；不得在应用层使用 count-then-update/delete 代替该约束。

## 账号生命周期与 Auth

- `suspended` / `closed`：服务端先调用 Supabase Auth Admin `updateUserById(..., { ban_duration })`，再写数据库状态；数据库失败会尝试恢复原 Auth ban 状态。
- `active`：先解除 Auth ban，再写数据库；关闭状态是数据库终态，不能通过该入口重新启用。
- 隐私匿名化：Auth ban → 数据库匿名化并解除 `user_id` → 硬删除 Auth 用户 → `admin_complete_member_auth_delete()` 写完成标记与审计。
- Auth 与 Postgres 无法组成单一事务。任何补偿、Auth 删除或完成标记失败都必须显示为“部分完成/需重试”，不能返回成功。
- Auth ban 不会主动撤销已经签发的 session；因此 Player 路由与所有数据 RLS 必须同时要求 `account_status = 'active'`。Auth tombstone 负责阻止已匿名化账号用旧 JWT 再建档。

Supabase 依据：[`auth.admin.updateUserById`](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid) 支持服务端更新 ban；[Managing User Data](https://supabase.com/docs/guides/auth/managing-user-data) 明确说明临时 ban 阻止新登录，但不会撤销既有 session。

## 发布对象与环境不变量

本改动包含 Auth 用户回填、legacy canonical 外壳、权限收紧、RLS 与审计触发器，不允许在 Production 首次试跑，也不允许把连接 Production Supabase 的 Vercel Preview 称为“隔离 Preview”。每次发布必须在证据包中记录以下信息；只记录 project ref 与变量是否一致，不保存 key、JWT 或其他 secret：

| 环境 | Vercel Environment | Supabase project ref | 硬约束 |
|---|---|---|---|
| 隔离 Preview | `Preview` | `<PREVIEW_PROJECT_REF>` | 必须是可丢弃的独立分支/项目，不得等于 Production ref |
| Production | `Production` | `<PRODUCTION_PROJECT_REF>` | 必须是正式项目，不得接收 Preview 测试数据 |

- 从该环境实际生效的 `NEXT_PUBLIC_SUPABASE_URL` 主机名提取 project ref，并核对 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（或 legacy anon key）与 `SUPABASE_SERVICE_ROLE_KEY` 均属于同一项目。不要在日志中输出 key 内容。
- 核对 Vercel 的 Preview/Production 变量作用域、branch override、`NEXT_PUBLIC_SITE_URL`、Supabase Auth redirect allow-list 与最终浏览器 URL；Vercel 显示 `Ready` 不能替代后端项目核对。
- 在测试前记录 Git commit SHA、Vercel deployment ID/URL、Supabase project ref 和迁移历史。页面、日志、SQL 结果必须能回溯到同一组标识。
- 若 `<PREVIEW_PROJECT_REF> = <PRODUCTION_PROJECT_REF>`、任一 ref 无法确认，或 Preview 使用了 Production 数据库，发布门禁立即失败；只能做只读检查，不得执行迁移、回填或测试写入。

## 本分支成员迁移顺序

在全新隔离数据库或尚未应用本功能的目标数据库中，按文件名顺序应用下列迁移。已经登记在目标迁移历史中的文件不得重复执行；禁止只挑最后一个 ACL 修复而跳过其依赖迁移。

1. `20260829175645_user_member_master_v1.sql`：主档案、回填、RPC、RLS、角色、审计与生命周期基线。
2. `20260830162310_admin_create_missing_member_identity.sql`：管理员首次编辑时补建缺失 identity。
3. `20260830163614_fix_member_restore_and_quiz_answers.sql`：恢复流程和原始问卷答案修正。
4. `20260830165712_restore_matching_table_acl.sql`：`match_rounds`、`match_sessions` 最小 Data API ACL 与策略修正。
5. `20260830174115_fix_operational_audit_trigger_record_scope.sql`：运营审计触发器记录作用域修正。
6. `20260830195942_explicit_data_api_acl_for_admin_surfaces.sql`：显式修复已确认的 Data API `42501`，并对 `scripts`、匹配、成员运营记录、玩家反馈、剧本游玩记录和问卷配置等 14 张直接访问表实施最小 ACL。匿名用户仅可读取 RLS 允许的已发布剧本；authenticated 与 service role 的权限按实际客户端操作逐表断言。

任何一步失败都必须停止；保存完整错误与已应用版本，不得在同一目标上反复重放大迁移。修正应使用新的、可审计的 forward migration。

## 隔离 Preview 发布门禁

只有以下步骤全部通过，才可申请 Production 数据库变更或合并 `main`：

1. 固定待发布 commit SHA，确认工作区差异与预期一致，并建立独立 Supabase Preview branch/项目或等价的可恢复数据库快照。
2. 按上一节核对 `<PREVIEW_PROJECT_REF>`、Vercel Preview 环境与最终 Preview URL；确认与 `<PRODUCTION_PROJECT_REF>` 不同。
3. 在任何迁移前运行 `supabase/audits/user_member_master_preflight.sql`，保存带时间、commit SHA 和 Preview ref 的完整结果。
4. 人工确认 Auth 数量、成员数量、旧成员数量、重复候选、无效引用和现有 ACL；脚本不会按姓名、邮箱或昵称自动合并。存在未解释异常时停止。
5. 按“本分支成员迁移顺序”只应用尚未登记的迁移，并再次核对目标迁移历史包含完整且有序的六个版本。
6. 运行 `supabase/audits/user_member_master_postflight.sql` 并保存完整结果，确认：
   - `auth_without_member_or_tombstone = 0`
   - 没有非法状态组合
   - 没有重复活动角色
   - 每行旧成员均有有效 canonical 对应，且没有迁移产生的孤立 legacy shell
   - 没有无效重复候选处置、audit subject FK 或缺失的 append-only trigger
   - audit actor role 快照完整，匿名化主档案在普通业务表中没有残留 PII
   - 12 类成员关联运营表均存在瞬时 reason guard 与相关记录审计 trigger
   - 无成员主体的实际业务变更进入 subjectless append-only 审计，存在成员主体时不会重复记录
   - legacy 只允许 super_admin 通过 reason-bearing RPC 编辑业务字段，authenticated 不能直写，任何角色都不能直接 DELETE
   - Staff 基表不向 anon/authenticated 暴露 `member_id`，公开安全视图仍可读取
   - 管理员管理 RPC、append-only 管理审计与“最后一位已绑定超级管理员”锁内保护均存在
   - RPC EXECUTE、表级 GRANT 与 RLS policy 符合权限矩阵

   所有 `invalid_count` 必须为 `0`；其他统计必须与 preflight 的预期变化相符。另需显式核对 `scripts`、`match_results`、`match_rounds`、`match_sessions`、`member_dynamic_stats`、`member_notes`、`mutual_reviews`、`activity_records`、`pair_relationships`、`match_round_submissions`、`player_feedback`、`script_play_records`、`unmatched_diagnostics`、`personality_quiz_config` 的 `has_table_privilege`、RLS 开关与预期 policy。
7. 从该 Preview project ref 重新生成 `src/types/database.types.ts`，与仓库版本比较；任何类型漂移必须解释并纳入同一 commit，不能从另一个项目生成类型。
8. 执行单元测试、类型检查、lint、生产构建和 `git diff --check`；随后在隔离数据上完成下列真实角色矩阵与 E2E，不能以静态 SQL 字符串测试代替：
   - `anon`：不能读取成员、legacy、审计或后台业务表，也不能调用受保护 RPC。
   - 普通 `authenticated` 用户：只能访问和修改自己的允许数据；首次登录幂等建档、分步草稿、提交与失败恢复均正常。
   - `admin`：可完成日常编辑并写入理由/审计，但不能查看或修改高风险字段、恢复历史、揭示匿名作者或执行生命周期高危操作。
   - `super_admin`：允许的覆盖、恢复、账号状态、重复候选与 legacy 流程均要求理由并产生字段级 before/after；不可变 ID/FK/技术时间仍不能覆盖。
   - 对允许与拒绝路径都检查浏览器结果、RPC/HTTP 状态、数据库最终行和审计事件；匿名化、硬删除、Auth 删除等破坏性用例只能使用可丢弃 Preview fixture。
9. 从固定 commit 生成 Vercel Preview，确认 deployment 为 `Preview` 且最终 URL 未跳回 Production。至少验收 `/app` 首次建档/资料提交、`/admin/members` 目录与超过 500 行搜索、Member 360/编辑/审计、`/admin/scripts`、`/admin/matching/cancellations` 及受影响的匹配/Staff/反馈流程。
10. 以验收开始时间和准确 deployment ID 过滤 Vercel 日志；上述路径的测试窗口内必须没有新的 `error`，也不得出现 Next 错误页、`42501`、`PGRST`、500、未处理异常或错误项目请求。同步检查 Supabase API/Auth/Postgres 日志中的异常拒绝和意外放行。
11. 归档发布证据包：两个 project ref、commit/deployment、迁移历史、preflight/postflight、类型差异、角色矩阵、E2E 结果和日志扫描。任一项缺失或失败均保持 No-Go。

## Production 两阶段发布顺序

前提是隔离 Preview 全绿，并分别获得 Production 数据库变更和 `main` 合并授权。Production 发布期间不得把数据库迁移与代码部署视为一个自动回滚事务。

### 阶段 0：备份与写冻结

1. 固定与 Preview 完全相同的 commit SHA 和迁移集合，记录当前 Production Vercel deployment 作为应用回退点。
2. 确认 `<PRODUCTION_PROJECT_REF>` 与 Vercel Production 环境一致；再次运行 Production preflight，若数据分布或 ACL 与 Preview 假设不符则中止。
3. 创建可验证的 Supabase 全库备份/快照或确认 PITR 恢复点，记录恢复时间点、`auth`/`public`/`private`/`storage` metadata 的覆盖范围和负责人；没有可验证恢复点不得继续。
4. 开启维护窗口并冻结受本迁移影响的写入：新用户建档、资料/问卷、成员与管理员编辑、导入、匹配、取消、Staff、反馈、LINE 绑定及写入相关定时任务。记录冻结前关键行数和迁移历史。

### 阶段 1：Production 数据库

1. 在保持写冻结的情况下，只应用迁移历史中缺失的六个版本；每步失败立即停止，不得继续合并 `main`。
2. 运行并保存 Production postflight、14 张 Data API 表的显式 ACL/RLS 检查和关键只读查询；所有门禁通过后才进入阶段 2。
3. 在旧 Production 应用仍在线时完成只读兼容性烟雾测试。若旧应用因新权限边界无法安全读取，保持维护页/写冻结并立即进入已批准的阶段 2，不能在半迁移状态开放写入。

### 阶段 2：Production 应用

1. 将已在 Preview 验证的准确 commit 合并并推送到 `main`，等待对应 Vercel Production deployment 达到 `Ready`；不得改用未验收的重建提交或不同数据库配置。
2. 在专用测试账号/可恢复 fixture 上完成登录、成员目录/360、一次日常编辑与审计、剧本、取消申请和玩家流程烟雾测试；不得对真实成员执行匿名化、硬删除或 Auth 删除。
3. 按准确 Production deployment ID 扫描发布后的 Vercel error 日志，并复查 Supabase API/Auth/Postgres 日志、关键行数和审计事件。没有新错误且数据一致后，才解除写冻结。
4. 解除冻结后继续观察约定窗口；发现权限、回填、认证或审计异常时立即重新冻结写入并进入回滚/forward-fix 决策。

## 回滚边界

- Vercel 回滚或回退 Git commit 只会恢复应用代码，不会撤销 Supabase schema、回填行、ACL/RLS、审计事件或迁移历史。回退前必须确认旧应用与已迁移数据库兼容。
- 本迁移会创建 canonical 成员/角色/重复候选与审计记录，设置约束，并改写权限策略；禁止用手工 `DELETE`、反向 DDL 或删除审计记录充当回滚。
- 数据库级回滚只能使用发布前已验证的完整备份/PITR。它会丢弃恢复点之后的数据库写入，因此只能在写冻结未解除、影响范围已确认且获得单独授权时执行。
- 一旦解除写冻结或产生需要保留的新业务数据，默认采用新的 forward migration 与人工对账，不能盲目恢复整库。
- 不得假设数据库恢复能安全反转所有 Supabase Auth ban/delete 与 session 状态；即使备份覆盖 `auth` schema，既有 JWT、LINE 外部绑定、Storage 实体对象/清理队列、Vercel 环境和其他外部副作用仍须按审计记录单独核对和补偿。
- 若阶段 1 通过而阶段 2 失败，优先保持写冻结并部署兼容修复或经验证的兼容旧版本；只有满足完整恢复条件时才回滚数据库。

## 必测正负向用例

- 新 Auth 用户第一次登录后立即出现在后台，刷新和重复回调不会生成第二行。
- 普通用户不能直接插入 `approved` 成员、修改其他成员、调用 admin RPC 或读取私有表。
- 分步草稿刷新后可续填；最后提交缺字段时不会进入 submitted/pending 完成态。
- 目录在超过 500 行时仍能搜索最旧记录，并返回准确总数。
- 普通管理员可做日常修改但不能改高危字段、恢复历史或揭示匿名身份。
- 超级管理员的覆盖、停用、匿名化和恢复均要求理由并生成字段级 before/after 审计。
- 超级管理员可编辑 legacy 业务原始字段，但不能覆盖 ID/FK/操作者/技术时间；普通 admin 和普通 authenticated 直写必须失败。
- 普通 360° 页面不会显示或统计匿名帖子、匿名评论与其真实作者映射。
- 匿名作者揭示必须用 super_admin 的 authenticated session，绑定同一条有效 pending/in_review 举报及理由；service role 不能执行揭示 RPC。
- 普通 admin 的会员编号、Auth 身份、外部绑定、quiz answers、roles、重复候选及高风险 audit 值必须在数据库响应层裁剪，而不只是隐藏 UI。
- 普通 admin 的轮次提交详情不得包含 availability、message、偏好、兴趣标签或 social style；后台原始问卷新增、更新与删除均应被数据库拒绝。
- 玩家直接调用数据库时，只能在 open 且未过期的轮次 INSERT/UPDATE 自己的问卷；closed/matched/过期写入、DELETE、改成员/轮次/导入元数据/技术字段必须失败。兼具 admin 与 member 身份的账号仍可走相同玩家自助路径。
- 匿名化后，admin 与 super_admin 的正常 audit RPC 均不能重新返回已清除的旧 PII，且历史事件不可恢复。
- 生命周期预检列出 FK、UUID 数组、社区历史和 Auth 账号影响，禁止留下孤儿引用。
- 管理员执行锁定、拆分、恢复、手动配对、再匹配、发布、撤回、取消审批和黑名单增删时，缺失或过短理由必须被 UI 与数据库同时拒绝。
- 普通玩家提交互评、请求取消等既有流程在收紧运营审计后仍可成功；service-role 后端流程不得因缺少真人理由而中断，并应产生 system 来源审计。
- Excel 导入分别模拟 create、delete、restore 与补偿失败；审计元数据不得含姓名、文件名或任意自由文本。
- 并发执行两个超级管理员的降级/删除请求，最多一个可成功，系统始终至少保留一位已绑定超级管理员；三个管理动作均留下真实 actor、before/after 与 reason。
- anon/authenticated 对 `staff_profiles` 做 `select *` 或读取 `member_id` 必须失败，而首页通过 `published_staff_profiles` 仍按预期显示已发布 Staff。
- 分别创建未绑定 Staff、空成员活动和尚无结果的匹配会话，确认各自只产生一条 subjectless 紧凑审计；为同类记录补上成员主体后，确认只产生 member audit 而不重复写 subjectless。

## 当前验证边界

- 本地 TypeScript、Vitest、静态 SQL 契约、lint 和 build 通过，只证明代码与迁移文本的静态一致性；它们不是数据库执行、数据回填或权限安全证明。
- 2026-08-31 已从 Vercel Preview branch override 确认隔离 Preview project ref 为 `ijddkjejgkseujqrrndh`，与 Production ref 不同。迁移前只读基线为 Auth 3、members 3、linked 3、accountless 0、legacy 0、无效引用 0、重复成员邮箱组 0；其中 2 个测试成员缺少 identity，可由首次管理员编辑流程补建。
- 同日已在该隔离 Preview 执行 `20260830195942_explicit_data_api_acl_for_admin_surfaces.sql`；迁移自身的 14 表 RLS、27 条 policy、PUBLIC 清零和精确 ACL 断言通过。`/admin/scripts`、`/admin/matching/cancellations`、`/admin/members` 及实际 Preview 成员 360 均可加载，原 `42501` 页面错误已消失。
- 该 Preview 原为“schema 已存在、迁移历史全为空”的测试库。核验主档效果与 ACL 后，已使用 Supabase 官方 `migration repair --status applied` 对齐仓库全部 55 个版本；`migration list` 显示 local/remote 一一对应，`db push --dry-run --include-all` 返回 up to date。随后正式只读 postflight 返回 `PASS`（6 条成员迁移、34 RPC、14 ACL 表、27 policy），没有手工写入迁移历史表。
- 已从 project ref `ijddkjejgkseujqrrndh` 重新生成 `src/types/database.types.ts`，补齐既有 schema 与成员主档 RPC；TypeScript、371 个单元测试、lint、生产 build 和 `git diff --check` 均通过。
- 使用公开 publishable key 与隔离测试账号完成了只读角色探针：anon 只能读取 `scripts`，读取 `match_results`/`members` 分别返回 401；普通 admin 可读取剧本、匹配、统计、备注和问卷配置，但直接读取 `player_feedback`/`unmatched_diagnostics` 返回 403；玩家只能看到自己的 1 条成员主档，并且同样不能直接读取反馈或诊断表。仍缺少全部写入/拒绝/审计用例，以及固定新 commit deployment 的发布后日志扫描；这些门禁补齐前不得合并 `main` 或对 Production 首次执行迁移。
