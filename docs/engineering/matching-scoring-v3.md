# 第4批：100分评分、人格权重与活动互评

迁移：`20261023155710_matching_scoring_v3_snapshot.sql`。新算法为 `max_coverage_split:3` / adapter `2`，评分规则版本为 `weighted_feedback:1`。原 `max_coverage_split:2` / adapter `1` 的原始输入、已准备输入及失败恢复继续按旧版本处理。

## 新运行的输入与评分

大项权重固定为100分：兴趣25、人格25、模式10、经验10、跨校5、避免重复15、双方活动互评10。管理员A/B/C/D及社交标签互补不参与新版本评分。旧冷却、重逢和历史加减分规则继续保持，历史调整在基础100分之外单独解释。

人格的 E/A/O/C/N 子权重取后台“社交人格测试”**当前已发布版本**的 `matchWeight`，在初次捕获时同时冻结版本编号和权重。草稿不影响算法；中途发布新权重也不改变正在恢复的批次。缺少已发布配置、非数字、越界或总和不为1均拒绝捕获，不能静默退回默认配置。

新活动互评只作为两人之间的软评分，不转化为个人声誉或新黑名单/冷却/重逢。每个方向按 `(6+有效评分之和)/(2+有效活动数)` 平滑；缺少方向按3分，双方取较低方向，再映射到10分。没有互评得到5分。每个活动、评价人和被评价人使用当前一条有效记录，编辑不增加样本；首版不做时间衰减。举报、处理状态和文字评价不参与算法。

来源只包含本轮符合资格候选人之间的有效评分。历史活动需未删除、名册已确认、双方仍在名册且为当前有效正式玩家、相关报名未取消；已结束的互评窗口仍属于历史评分。快照只保留评分记录编号、活动编号、双方成员编号、数值和记录版本，不复制评价文字或举报。名单移除再加入不会自动恢复此前已作废的评价。

## 兼容与权限

新服务端调用独立的 `admin_begin_matching_run_v3`。旧 `admin_begin_matching_run` 和旧 source/capture 保持原样，因此先应用迁移时旧部署仍能运行旧算法。共享 stage/seal 校验新输入必须与原始快照的规则完全一致，包括固定100分权重；旧快照不能借新入口偷偷换成新规则。新入口可恢复旧 v2 批次，但不会读取新配置或新互评。完成接口同时接通引擎原有的 `game_type` 字段、旧 v2 多人池的空分项（`null`）及新 v3 多人池的汇总对象；双人分项继续使用数组。这是输入输出格式兼容修复，不改变匹配规则或覆盖人数。

只有 service role 加有效管理员能取得新原始捕获数据。浏览器仍只能列出安全批次元数据；没有新增成员端互评数值读取权限。所有新内部函数撤销 PUBLIC、anon、authenticated 和直接 service role 权限，仅新 begin 内部实现允许服务角色调用。用户可读取的 session.config 只保留规则版本和维度权重，剔除完整互评数组；结果评分明细继续沿用已有的管理员评分列权限，玩家无法读取 score_breakdown 或 total_score。本迁移前置断言该保护，既不修改结果列授权，也不新增私有明细副本。既有成员匿名化按 subject index 清除整个原始快照及 engine input，新评分引用的双方身份也纳入该索引。

本次不改问卷定义、用户答卷、手工修改的面试前信息表、完整报名大池、边收集边运行、单一多人池、重开、导入、取消池、冷却重逢或发布保护。运行和恢复不会自动发布结果或通知用户。

## 验证与发布

`supabase/audits/matching-scoring-v3-pglite.mjs` 先执行原192项输入快照回归，再在隔离 PostgreSQL 执行真实迁移、新旧 RPC、捕获、恢复、stage、complete 和成员匿名化。检查旧函数/业务/问卷未改变、旧客户端仍创建 v2、旧 raw/staged 恢复、新发布权重和互评修改冻结、草稿不生效、无效与名单/报名/成员资格过滤、严格 stage 策略一致性、闭窗历史评分、权限、隐私及无通知副作用。

`supabase/audits/matching-scoring-engine-pglite.mjs` 进一步走通真实 SQL 捕获 → 当前 TypeScript `prepareMatchingRunInput` / `runFullMatching` → 真实 stage/complete RPC，直接使用算法输出，不手写替代结果。分别覆盖 v2/v3 的4人双人方案和7人单一多人池，检查完整保存、畸形输出拒绝、成功响应丢失后的幂等重试、版本分项格式及边收集边运行。该脚本通过原192项回归及新增48项检查；前一个评分快照脚本通过原192项及新增150项检查，两者的原192项属于重复执行的基础回归。

运行命令（已安装可解析的 `@electric-sql/pglite` 和 `esbuild` 时，无须设置环境变量）：

```sh
node supabase/audits/matching-scoring-v3-pglite.mjs
node supabase/audits/matching-scoring-engine-pglite.mjs
```

也可以使用仓库外已安装依赖；将下列路径替换为实际绝对路径，无须向产品增加依赖：

```sh
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js \
  node supabase/audits/matching-scoring-v3-pglite.mjs

PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js \
ESBUILD_MODULE=/path/to/esbuild/lib/main.js \
  node supabase/audits/matching-scoring-engine-pglite.mjs
```

正式发布从独立 workdir dry-run，仅应用此增量；不得盲目重放历史迁移或将 linked Preview 当作 Production。生产只读执行 `supabase/audits/matching-scoring-v3-postflight.sql`，核对新入口 ACL、安全评分源和版本，不创建真实匹配批次。应用部署前后比较问卷、面试前信息表、业务数据和通知指纹，随后确认 CI、Vercel Ready 及正式后台界面。
