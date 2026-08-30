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

## Preview 发布顺序

本迁移包含数据回填和权限收紧，不允许直接在 Production 首次试跑。

1. 确认目标是住系社 Supabase 项目，而不是名称相似的其他项目。
2. 建立隔离的 Supabase Preview branch 或等价的独立数据库快照。
3. 运行 `supabase/audits/user_member_master_preflight.sql` 并保存所有结果。
4. 人工确认 Auth 数量、旧成员数量、重复候选和无效引用；脚本不会自动合并。
5. 应用 `supabase/migrations/20260829175645_user_member_master_v1.sql`。
6. 运行 `supabase/audits/user_member_master_postflight.sql`，确认：
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
7. 从该 Preview 数据库重新生成 `src/types/database.types.ts`，与仓库类型比较。
8. 执行单元测试、类型检查、lint、构建及 admin/user/super_admin 正负向浏览器测试。
9. Preview 验收通过后，再分别申请 Production migration、代码推送及合并 `main` 的授权。

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

仓库本地没有可用的 Docker/Postgres，且当前可访问的 Supabase 连接不是住系社项目。因此，本地可完成 TypeScript、Vitest、静态 SQL 契约、lint 和 build；迁移执行、真实数据回填结果、实际 ACL/RLS 正负向测试必须在正确的隔离 Preview 数据库补做。
