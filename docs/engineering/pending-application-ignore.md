# 待处理申请忽略与恢复

`/admin/members/pending` 每行可填写 4–500 字备注后忽略，下方“已忽略”列表显示当前操作人、忽略时间和备注，并支持填写说明恢复。操作人来自当前登录管理员，不能由浏览器指定。

两份名单与仪表盘沿用相同资格：当前档案、账号正常、待审核、资料已提交或完成、注册第 4 步、存在身份资料。待处理列表、计数和批量通过前的读取通过数据库 anti-join 排除已忽略记录；忽略列表使用一对一 inner join，按忽略时间倒序、成员 ID 稳定排序，每页 50 人。搜索按姓名、昵称、学校匹配，两个列表各自分页。

`public.member_application_ignores` 仅保存当前忽略状态，不改 `members`、审核状态、会员编号、注册进度或 `updated_at`，不触发用户通知。备注仅管理员可读；普通用户不能查询或直接写入，服务角色也只有 SELECT。恢复删除当前标记，但忽略和恢复均向既有不可变 `private.member_profile_audit_log` 追加 `related_record_change/application_queue`，保留操作人 UUID、姓名快照、说明和前后状态。匿名化沿用历史审计隐私规则，并清理当前忽略备注。

写入使用私有 SECURITY DEFINER 实现及公开 SECURITY INVOKER RPC，限制 authenticated 调用且在数据库内重新检查真实管理员权限。忽略、恢复、队列通过都先锁定成员行。忽略核对成员资料版本，恢复核对当前 `ignored_at`，队列通过在同一事务中重查资格和忽略状态，再调用既有审核 RPC，保留原完整资料校验及审核审计。成员详情页仍可由管理员显式通过申请；通过后该记录自动离开申请队列。

## 验证与发布

- 单元测试覆盖计数/列表/审批 scope、两份分页、搜索转义、服务端参数校验、返回确认和后台刷新范围。
- `PGLITE_MODULE=/path/to/pglite/dist/index.js node supabase/audits/pending-application-ignore-pglite.mjs` 执行真实迁移和审核函数，检查权限、审计、版本冲突、忽略与审批顺序、恢复旧版本、匿名化及成员数据不变。
- 类型检查、lint、单元测试、生产构建通过后发布。数据库迁移先于新版应用部署。
- 迁移 `20261022171533_pending_application_ignore.sql` 只新增结构、函数、权限和清理触发器，不批量忽略任何真实申请。
- 正式库发布使用独立临时目录，核对项目 `wjjhprflldvclulistcx` 及迁移历史，复制已有远端迁移和本次唯一增量。`db push --linked --dry-run --skip-vault` 必须只列出该增量，随后按相同范围应用；不得从当前链接 Preview 的主工作区直接发布或使用 `--include-all`。
- 应用前后执行 `supabase/audits/pending-application-ignore-postflight.sql`，核对安全顾问差异和现有成员摘要不变。线上页面只读验证，不拿真实申请测试忽略/审批。

2026-10-23 发布核查：1,771 项单元测试、12 组真实 SQL 隔离检查、类型检查、lint 和生产构建通过。正式库唯一增量已应用；288 条成员数据、身份资料摘要和 1,989 条审计保持不变，当前忽略状态为 0。真实 REST 反连接返回原有 1 位待处理申请，忽略关系排序返回空列表，匿名读取忽略表返回 401。安全顾问仅新增两条 `authenticated_security_definer_function_executable` 提醒，对应刻意向 authenticated 开放、内部重复核验管理员权限的两个私有写入实现；其余提醒不变。SQL 隔离测试验证两种串行顺序和旧版本拒绝，未宣称执行多连接并发压测。
