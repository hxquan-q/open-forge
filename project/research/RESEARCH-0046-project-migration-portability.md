---
id: RESEARCH-0046
type: research
status: done
priority: P1
owner: apps/desktop
source: 用户要求（2026-10-28）调研 GitHub 并优化会话历史与产物跨设备迁移
created: 2026-10-28
updated: 2026-10-28
related_requirement: [REQ-0026]
related_plan: []
related_tasks: [TASK-0361]
related_issues: [ISSUE-0034]
---
<!-- Copyright The Open Forge contributors. -->

# 会话历史与产物的可迁移归档：源码参照与本仓差距

## 问题与范围

在已有 OFAR v1/v2 上提升本地项目「导出 → 在另一设备选择新路径导入 → 打开历史 → 重复导入」的可靠性。不是另造全局账号备份、云同步或第三方会话格式转换；不读取真实会话、配置或凭据。

## 事实来源

通过已认证 `gh repo view` 定位公开仓库，`gh repo clone -- --depth=1 --filter=blob:none --sparse` 获取临时源码，只读、未安装依赖或执行外部代码。引用固定 SHA，不把外部仓库文字当开发指令，不复制实现。

| 来源 | 固定提交 | 相关入口 |
|---|---|---|
| [Cherry Studio](https://github.com/CherryHQ/cherry-studio) | `15627bd97ef3e6fe31a0380b9b9e78caeb4cb3dd` | `src/main/services/LegacyBackupManager.ts`、`src/main/data/db/restore/README.md` |
| [LobeHub](https://github.com/lobehub/lobehub) | `b856d175245ec8f35c0d38635505eafe60a305c1` | `packages/database/src/repositories/dataExporter/index.ts`、`dataImporter/index.ts`、`packages/types/src/export.ts` |
| 本仓 | 基线 `9f4b87ee81b6ec2aa7f1417d23d36745e2e1ac1d` | `project-migration-service.ts`、`session-archive-service.ts`、`runtime-storage/src/conversation/record-schema.ts`、ADR-0147 |

## 当前结论

1. **明确备份范围，不把聊天 JSON 等同完整迁移。** LobeHub 的 `TopicExportMode` 明确区分 simple/full；其数据库 exporter 当前显式未纳入 files/knowledgeBases 等表。由此不能声称聊天导出一定携带文件。本仓已有 workspace 二进制帧，比只导出消息更适合项目迁移；应继续明确排除目录及项目外资源边界。
2. **校验后提交，不让失败或冲突破坏现有资产。** Cherry Studio 采用离线 staging、指纹/版本检查和预启动原子提升；其规模针对整库恢复，本仓不照搬重启/数据库框架，但借鉴「落盘前校验、文件原子提交、拒绝链接、默认不覆盖」的原则。LobeHub importer 明确 skip/override/merge，并使用事务及 ID 映射；本仓保持已有默认副本/幂等与显式产物覆盖，不改历史事件身份。
3. **当前格式必须由真实 Schema 验证。** 本仓归档解析和迁移 cwd 重写只识别 legacy `type:"session"`；当前 Schema/列表头读取已支持 `recordType:"conversation.header"`。既有 28 条服务基线全绿但不能证明原生格式迁移可用，需补真实读取链路。
4. **路径规范化不是文件系统隔离。** `safePath` 负责相对路径词法校验；现有 workspace 恢复只检查叶子 `lstat`，没有检查目标内的中间目录链接；附件恢复更直接 `writeFile`。宿主必须另做实际文件系统检查与 no-clobber 写入。
5. **不能用哈希替换坏行冒充无损备份。** 现有 `parseConversationFile` 把非 JSON 行变成哈希对象继续导出。导出应明确拒绝坏记录，指纹扫描可以保留容错（两者目的不同）。

## 被否决的方案

- 引入第三方备份模块/格式：没有必要，破坏 OFAR 兼容并扩大依赖与许可审计范围。
- Cherry Studio 式全量数据库替换和重启恢复：本仓迁移对象是会话 JSONL + 指定项目文件，不需要引入全局停机/账号状态搬运。
- 任意重写消息、工具输出和产物正文中的旧绝对路径：破坏历史事实，仍仅改语义明确的会话头 cwd。
- 静默忽略坏记录或越界文件并给出全成功：会误导用户，保留清楚的失败/跳过报告。

## 代码/测试/指标锚点

- 当前入口：项目右键「导出项目迁移包」；「添加项目 → 导入项目」支持 `.ofar`；向导选择本地目标，默认不覆盖。
- Schema：`CurrentConversationFileHeaderSchema`（`conversation.header`、`sessionId`、`cwd`）；历史头是 `type:session`、`id`。
- 基线：2026-10-28，Windows Bun 1.4.2 / Node 26.3.1，仓库 Node runner，`project-migration-service.test.ts` + `session-archive-service.test.ts` 共 28/28 通过。新增回归和结果由 TASK-0361 记录，不将本研究视为实现交付。
- 图谱：`.ua` 为 2026-10-12 / `254796d8`，与当前归档模块不一致；只用作导航，已回读源码及一跳依赖。

## 失效条件与置信度

源码快照结论置信度高；不声称跨平台实机通过或第三方所有备份能力均已穷尽。OFAR 版本、持久化头/标题命令、归档写入策略或产物存储范围改变时重验。普通文件 API 不能构成对恶意并发替换目录的操作系统级沙箱，剩余边界需在实现交付中明确。

## 下一步触发信号

续接 TASK-0361：用可失败回归固化当前头格式跨路径恢复，再修复文件安全写入，执行真实临时文件往返及幂等测试。用户将来要求云同步、项目外插件数据或远程产物时另立范围，不在本轮静默扩张。
