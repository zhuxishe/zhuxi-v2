# TST 测试账号池的一次性上线操作

脚本不随部署自动执行，也不运行算法或发布。所有修改均须操作者明确执行。

1. 导出只读生产预检：exact 27旧成员、六名真实测试参与者的资料及答卷哈希、模板、轮次、方案、发布、通知和发号序列。原始备份、config、manifest、密码都放在仓库外的0600文件中。
2. 隔离数据库验证迁移、清理dry-run/重放及保护断言；schema安装不删除业务数据。
3. 部署schema和应用，核对版本，然后依次执行以下阶段。

```sh
node scripts/operations/test-account-pool/manage.mjs prepare --preflight /private/tmp/production-preflight.json --out /private/tmp/tst-pool/manifest.private.json
node scripts/operations/test-account-pool/manage.mjs dry-run --config /private/tmp/tst-pool/config.private.json --manifest /private/tmp/tst-pool/manifest.private.json
```

私密config含 `apiUrl`、`serviceKey`、`anonKey`、`actorAdminId`。只允许回环隔离服务或明确正式项目 `wjjhprflldvclulistcx`。服务密钥不进入命令参数、输出、日志或账号说明。

后续命令都带上述config/manifest路径，生产写入须额外带 `--apply --project-ref wjjhprflldvclulistcx`。回环写入只需 `--apply`。

| 阶段 | 行为 |
|---|---|
| `provision` | 合法Auth Admin API创建用户；受控RPC创建pending测试成员；真实登录并以现有问卷RPC提交当前面试表；受控激活；提交补充、自评和人格测试。没有伪造JWT或完成标记。全部27人完成后才清理旧数据。 |
| `cleanup` | 单事务exact UUID清理。固定receipt/round/27 UUID及每人的IMP编号/姓名一致，拒绝发布/旧测试收件或方案通知/running/其他业务关联。六名真实参与者答卷和原报名回执均保留；旧27相关草稿整份退役删除及其快照/调整输入，删除旧成员/问卷/报名；导入hash保留tombstone。旧27审计只保UUID/操作人/时间/删除事实，不停审计trigger，不动真实个人问卷审计。 |
| `configure` | 保留原测试轮次，登记精确33人白名单：27 TST＋ZXS_000/001/006/016/081/250。 |
| `enrol` | 27人真实登录，逐人核对轮次定义与收集窗口、读取live配置版本后走现有报名RPC；丰富合成日期、时间和偏好；不改六名真实参与者答卷。 |
| `verify` | 27人密码登录、完整资格、唯一有效报名；保存私密验证报告。另比对正式序列/正式统计/六名真实参与者资料答卷/原模板/名单外通知与前置基线一致。 |
| `credentials --out PRIVATE_MD` | 导出私密账号说明；然后用户手动运行算法、核对、发布。 |

恢复须始终保留同一个manifest：固定UUID/密码/Auth返回ID/阶段检查点。不要重复prepare。Auth响应丢失时按exact email及管理员app metadata batch/code找回，不接管无关同邮箱。问卷重试读取实际assigned template/revision，已完成保留。清理失败整事务回滚，成功后重复请求只回already_applied。备份供受控恢复，不自动回插老身份。

退出新池时先撤回发布、停用登录、核对关联，再按exact UUID清理；不要按名字/宽泛号段删除。此脚本故意不提供自动发布、删除所有Auth、改评分或回滚问卷模板的功能。
