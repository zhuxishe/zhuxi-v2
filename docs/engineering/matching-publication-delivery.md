# 匹配结果发布与站内通知

范围：匹配草稿发布、撤回、取消审批及站内通知。匹配算法、问卷、匹配收集截止时间、重开与导入规则均未调整。

## 数据契约

- `match_sessions.publication_version` 从 0 开始，每次发布加 1；`published_at` 是当前版本发布时间。撤回保留版本，下一次发布继续递增。
- `match_results.publication_version > 0` 证明该结果发布过。人工拆分的未发布取消结果仍为 0。撤回后恢复为草稿的结果自动清除此标记。
- `results_ready` 是运行写入完成的元数据。新会话默认 false；原子 `admin_finalize_matching_session` 同时完成原有轮次 CAS（open 保持 open，closed 转 matched）和 ready。发布必须 ready 并通过实际结果、诊断名单及汇总完整性校验。
- 旧会话通过 DDL 默认值获得 `results_ready=true`，避免对含匿名化成员的历史会话执行 UPDATE；发布仍逐项校验实际完整性、账号状态和冲突，该标记不是授权或校验绕过。
- 非公开 `matching_publication` schema 保存版本、最小成员名单、结果标识及有效分配。版本和成员名单使用稳定 UUID 出处，不随已撤回草稿删除而级联消失；撤回通知因此可留存，原草稿链接仍不可读取。未保存用户问卷或个人资料快照。
- `active_assignments(round_id,member_id)` 主键保证同轮每人只有一份有效匹配；取消的历史匹配保留可查看，但不占有效分配。
- 公开 RPC 都是 SECURITY INVOKER 包装；实现函数在未通过 Data API 暴露的 schema 中，独立检查 auth.uid、管理员和原因。内部事务上下文表无客户端写权限，不能用 GUC 伪造。

## 原子操作

`admin_publish_match_session`、`admin_unpublish_match_session`、`admin_delete_match_session_draft` 均接受 `p_session_id,p_expected_publication_version,p_reason`。发布期望 V，成功得到 V+1；重复 V 请求在当前正好 V+1 且已发布时幂等成功。撤回和删除使用当前 V；旧页面不能操作后来重发的版本。

`admin_approve_matching_cancellation` / `admin_reject_matching_cancellation` 接受 `p_result_id,p_expected_publication_version,p_expected_requested_at,p_reason`，其中 requested_at 必须原样透传当前申请的数据库时间戳，避免拒绝后再次申请仍被旧审批页操作。批准仅取消本组、释放本组有效分配、向本组发送一次取消通知，其他组保持已发布。撤回中的结果不接受旧取消审批；审批必须属于当前仍有效的发布版本。玩家 `request_my_match_cancellation` 需带当前 `p_expected_publication_version`；旧两参数调用明确拒绝旧客户端，不静默套用到新版本。

发布事务一起完成 session/results 确认、版本成员名单、有效分配和通知。任何通知错误会回滚全部业务变化。撤回使该版本旧通知失效，并向相应成员发送撤回消息；重发使旧版本通知失效。已在其他批次获得有效匹配的人不会收到旧批次的错误“未匹配”或“撤回”消息。

`get_my_matching_publications()` 按当前登录成员返回轮次状态，优先有效分配，再读取其最近公开批次名单；从未进入公开批次的新答卷为 waiting。不会将当前问卷人数当作运行时名单。返回 `round_id,round_name,session_id,session_name,publication_version,published_at,status,result_id`。

## 发布保护

- 发布中的结果不能通过直接 API、手动配对、拆分、重跑、补偿删除或汇总更新改写成员、时间或状态。必须先撤回。已有取消申请、拒绝审批和匿名化隐私清理仍可改必要元数据；批准走窄 RPC。
- 删除旧草稿仅在没有其他会话且轮次原为 matched 时恢复 closed；open 不受影响。有其他会话的轮次状态不变。
- 用户结果 SELECT RLS 仅允许本人有效发布结果及已发布过的取消历史；撤回、未发布草稿和未发布 split 历史不可读。
- 新旧互评路径的新记录需带 `mutual_reviews.match_publication_version`。数据库锁定会话后重读结果，确认当前发布版本和参与者；旧 NULL 历史记录保持原样。

## 隔离验证

```sh
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node supabase/audits/matching-publication-pglite.mjs
```

脚本只运行隔离 PostgreSQL，验证真实迁移 SQL、RLS、RPC、版本、回滚和数据库约束。PGlite 单后端不等价于真实双连接并发或压力测试；并发安全另依赖共享 round/session 锁顺序、结果写 NOWAIT 保护、轮次成员唯一主键以及版本 CAS。

## 增量发布和只读 postflight

1. 核对生产 project ref，保存问卷、轮次、答卷、旧匹配会话/结果及通知业务字段摘要和 advisor 基线。
2. 只应用 `20261022183350_matching_publication_delivery.sql`，将迁移源和 ledger 登记放在同一事务，禁止 include-all。生产不存在已发布结果时，不产生通知和新分配。
3. 执行 `supabase/audits/matching-publication-postflight.sql`。确认包装函数 invoker、实现 schema 未暴露、内部表 RLS/ACL、guard、重复分配计数和 legacy 内容摘要。
4. 精确校验部署提交、CI、Vercel Ready，并用登录浏览器只读检查匹配列表、后台草稿及问卷。真实发布/取消/新通知用例在隔离数据中验证；不以测试为由修改真实匹配或真实答卷。
5. 回滚应用前保留 migration。新增列和表兼容旧读取，但旧发布写将被保护拒绝；不能撤销数据库 guard 后继续使用旧的分步发布。若需回滚，应先暂停发布入口再交付审查后的定向回滚迁移，不删除历史版本或通知记录。


## 第5批第一阶段：取消申请的发布边界

增量迁移 `20261023173445_matching_cancellation_publication_boundary.sql` 只新增 nullable
`match_results.cancellation_publication_version` 并替换 4 个既有函数体，不回填或删除历史业务数据。

- 新申请冻结所属发布版本，审批同时核对请求版本、结果版本、当前会话版本及数据库申请时间戳。撤回后旧申请不能套用到重发版本。
- 撤回清空该批结果的当前取消申请和审批元数据；原 `cancelled` 结果保持取消，是否恢复仍由原有操作决定。恢复后的草稿及重新发布的有效结果不继承旧“取消已批准”状态。
- 清除前后的字段、申请理由及所属版本由原 `member_master_audit_related_change` AFTER 触发器写入 `private.member_profile_audit_log`。沿用既有私有权限和匿名化后的审计脱敏，不另建归档表或公开历史理由。
- 同一版本拒绝后重新申请，会清空前次审批人和审批时间；旧时间戳仍不能审批新申请。
- 审批列表及数量只计当前有效发布版本的待处理申请，审批提交请求所属版本，不用后来更新的会话版本替代。
- 整组取消、同轮唯一有效匹配、发布/撤回通知去重、人工配对权限、评分、重开和旧冷却规则保持不变。

隔离复现与回归：

```sh
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node supabase/audits/matching-cancellation-boundary-pglite.mjs
```

先通过原 SQL 复现“旧待审申请批准新版本”及“恢复重发残留已批准”，再执行真实新迁移，验证版本绑定、整池取消、审计留存、失败事务回滚、重试、私有访问和评分列权限。继承运行原发布专项 77 项。真实多连接并发由项目全流程回归另行核验。
