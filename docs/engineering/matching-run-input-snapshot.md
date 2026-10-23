# 匹配批次输入快照与候选资格

范围：运行前复核候选资格、在当时完整报名大池中运行、保存不可变输入。已获本轮有效匹配的人仍可进入新草稿。评分权重、收集窗口、重开与 Excel 导入规则均保持原行为；新运行使用第 2 批覆盖优先的单一多人池算法，详见 `matching-single-pool-algorithm.md`。第 5 步的同轮唯一有效匹配发布保护继续生效，不会自动替换旧发布。

## 数据与资格

`matching_run` 是未暴露于 Data API 的独立 schema。`snapshots` 保存一次捕获的源数据与封存算法输入，`subjects` 记录源数据涉及的成员，包括未入池报名者及历史、黑名单、互评中的其他成员。所有内部表启用 RLS，撤销 anon/authenticated/service_role 直接读写；公开 RPC 是 invoker 包装，受限实现是独立 definer。

捕获源数据在一个只读 SQL statement 中读取。先锁定轮次和报名成员，使用既有只读资料完成判断；资料保存及匿名化与 canonical member 行锁串行。捕获后锁定其他历史关联成员并检查捕获期间的匿名化变化，防止擦除后保存旧的嵌套个人信息。源数据包括：

- 轮次当时的状态、配置、时间与版本字段。
- 按原 `created_at DESC` 顺序的本轮答卷及算法实际使用的资料字段白名单；没有增加同时间戳的 ID 排序。身份核验、联系方式等无关敏感列不复制。
- 每位报名者的资格、排除原因、资料完成情况及导入例外。
- 当时已确认会话中的已确认匹配记录，包括来源与发布版本；黑名单、旧互评，以及相关问卷响应/模板版本和摘要。

在线成员需批准、启用、玩家、当前档案、已绑定账号且未匿名化，三类匹配资料完成；取消报名不入池。已获得本轮有效匹配不是排除条件。

保留现有导入例外：合法 `current` 导入的匹配成员标识必须与本人相同，仍需满足在线身份资格，但可豁免三问卷完成要求。`temp/legacy-temp` 仅在记录来源为 import、未绑定、current/historical、编号属于该轮 `IMP-<round-prefix>-` 且来源元数据完整时保留离线参与。停用、关闭、未批准、非玩家或匿名化仍排除。不新增导入回执、不重写已有导入元数据。普通报名数据库 guard 原本就强制新报名的来源元数据为空，并禁止普通玩家改写系统字段。

## API 与封存

仅服务端 service_role 调用，且 DB 再检查传入的管理员仍存在且绑定账号：

- `admin_capture_matching_input(p_round_id,p_actor_admin_id,p_reason)` 返回 `{snapshot_id,captured_at,source}`。
- `admin_seal_matching_input(p_snapshot_id,p_session_id,p_actor_admin_id,p_engine_input)` 只允许同管理员、同轮次、尚未完成的草稿；核对候选顺序、人数、idMap、会话配置和算法/适配器版本。成功一次后不能重新封存。
- `admin_discard_matching_input(p_snapshot_id,p_actor_admin_id)` 只删除失败运行未封存的捕获。
- `admin_read_matching_input(p_session_id,p_actor_admin_id)` 供可信服务端读取快照；不提供浏览器原始资料入口。

`engine_input` 保存算法真正收到的 `candidates`（顺序保留）、`pairRelations` Map entries、`idMap` entries、原 `DEFAULT_CONFIG`、算法版本（历史 `max_coverage_split:1`、新运行 `max_coverage_split:2`）及 `adapter_version=1`。转换和运行不再回读实时资料、历史或答卷。封存后实时资料修改不会改写旧批次。

`admin_get_matching_input_metadata(p_session_id)` 仅当前管理员可调用，返回捕获时间、人数、摘要、封存/脱敏状态，不含原始答卷或算法输入。新轮次运行的 `input_snapshot_required=true`，原子 finalize 必须先有封存输入；原收集中保持 open、已截止转 matched 及日期 CAS 完全保留。旧会话不回填、标记 legacy；manual 等无关运行路径不被强制引入新流程。

匿名化会清除任何涉及该成员快照的整个 `source/engine_input`，保留原捕获时间、计数及摘要等脱敏元数据。隐私擦除后不能以旧的计算结果重新封存。草稿补偿删除会级联删除已关联快照；没有会话的失败捕获由 discard 清理。进程在关联前终止可能留下不可公开的未封存捕获；该数据仍受权限和匿名化擦除保护，本批不增加运行任务/恢复机制。

## 隔离验证

```sh
PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node supabase/audits/matching-run-input-pglite.mjs
```

脚本应用真实发布迁移和本次迁移，核对权限、资格、导入例外、保留已匹配者、封存完整性、来源不变、finalize 联动、旧路径兼容及匿名化擦除。已有资料完成规则由独立 readiness 数据库审计验证；本脚本以受控完成结果测试资格边界。PGlite 是单后端隔离数据库，不能代替真实多连接并发压力测试。

## 单一增量发布

1. 保存正式 project ref、原业务数据摘要、问卷/面试前信息表版本及 advisor 基线；仓库当前链接的 Preview 不代表 Production。
2. 只应用 `20261023054728_matching_run_input_snapshot.sql`；迁移源和 ledger 登记放在同一事务，禁止 include-all。
3. 执行 `supabase/audits/matching-run-input-postflight.sql`，确认 schema 未暴露、表 ACL/RLS、五个包装函数权限、finalize guard，且原业务字段与问卷摘要不变。正式既有会话不获得伪造快照。
4. 部署精确提交，验证 CI、Vercel Ready、后台现有轮次和会话只读页面。真实候选资格、捕获、发布通知等变更用例使用隔离数据，不为验收修改正式答卷或发送真实通知。
5. 旧应用仍可读取新列，但旧 run action 无法给新轮次运行封存输入，因而 finalize 会安全拒绝。回滚应用需暂停运行入口并提供定向兼容方案；不能关闭输入保护后静默产生无来源的新批次。
