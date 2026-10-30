---
id: BUG-0154
type: bug
status: verifying
priority: P1
owner: apps/desktop
source: TASK-0361 续接调查与原生 Runtime 往返回归（2026-10-28）
related_requirement: [REQ-0026]
related_plan: []
related_tasks: [TASK-0361]
related_issues: []
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# 归档仍按 legacy 会话命名与读头，当前原生历史导入后无法读取

## 用户流程

- Given 当前 Runtime 创建、命名并完成一轮对话的原生会话及项目产物；When 导出 OFAR 后在另一数据目录/新项目路径导入；Then 标题与身份保留、cwd 指向目标，可由侧栏目录及真实历史读取接口重新打开并续写。

## 实际与期望

旧解析只读取 `type:session` / `session_info`，漏掉当前 `conversation.header`、seed/name operation；会话 ID 退化成源文件名，标题/cwd 丢失，迁移也不改原生头 cwd。导入统一用随机 `.jsonl` 名字，Runtime 只认 sessionId 对应的 canonical `.conversation.jsonl`，导致成功提示后的文件不可发现/读取。另一个无损性缺口是坏 JSON 行被替换成哈希对象后继续导出成功。

期望：原生与 legacy 分别遵循既有读取合同，原生 canonical 身份保留；原生同 ID 不同内容明确拒绝，不覆盖或制造不可读副本。坏记录明确拒绝导出，源文件不动。

## 环境与失败证据

Windows / Bun 1.4.2 / Node 26.3.1，基线 `9f4b87ee81b6ec2aa7f1417d23d36745e2e1ac1d`；仓库 Node runner 执行 `session-archive-portability.test.ts`，新增 4 条均红：ID/标题/cwd 不匹配、preview 标题错误、同身份历史静默生成不可读副本、损坏记录仍返回归档字节。源会话由真实 `FileConversationRepository` 写入，未 Mock Runtime，不访问真实用户目录。

## 最小复现

1. 通过真实 Repository create → append → session.name.set 生成原生会话。
2. 经真实归档服务导出和迁移导入到隔离 agent/项目目录。
3. 用公开 catalog、history reader 和 repository 读取导入文件；检查身份、cwd、标题和原始事件。

## 根因证据与影响

归档服务旧适配滞后于当前 Schema 和文件路径合同。只验证 JSONL 字节存在不足以证明会话可用。原生路径必须由公开 `resolveConversationFilePath` 生成；改 ID 会改变指纹及事件身份，不能当作局部修复。外部源码与只读调查见 RESEARCH-0046，详细修复与验证回填 TASK-0361。

## 回归测试

`session-archive-portability.test.ts`：单会话 v1 往返、v2 预览/跨根迁移/真实重开/二进制产物/幂等、同身份冲突、坏记录拒绝。既有 legacy 服务与 UI/IPC 测试保持回归。

## 修复与验证

- 修复：提取两种头及标题元数据；仅改已声明源 cwd 的两种头；原生 canonical 无覆盖提交，legacy 副本语义保留；坏 JSON 行明确报错。
- 验证：原生四条失败回归已绿，最终归档六文件 75/75、Renderer 29+5、impact direct50/related78、完整 check exit 0；真实 catalog/reader/repository 重开与导入后持久化续写通过。独立审查及两 P2 修正复审通过，证据见 TASK-0361。
- 未运行：真实 UI/双设备/Provider（未授权）；不将 Repository 续写证明称为真实模型续跑验收。
