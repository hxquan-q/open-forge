---
id: BUG-0153
type: bug
status: verifying
priority: P1
owner: apps/desktop
source: TASK-0361 续接调查与临时目录回归（2026-10-28）
related_requirement: [REQ-0026]
related_plan: []
related_tasks: [TASK-0361]
related_issues: []
created: 2026-10-28
updated: 2026-10-28
---
<!-- Copyright The Open Forge contributors. -->

# 归档恢复只检查叶子路径，目录链接可越界写入且无效目标留下孤立会话

## 用户流程

- Given 迁移包含 `nested/deep.txt`，目标项目的 `nested` 已是指向另一个目录的 junction/symlink；When 默认导入或显式覆盖导入；Then 不能写到链接外部，应将该产物列为失败。
- Given 目标位置是普通文件而非目录；When 导入迁移包；Then 应在会话落盘前拒绝，不能留下在侧栏中无法正常使用的历史。

## 实际与期望

旧实现只 `lstat(targetPath)`，父级链接会被 `mkdir(...recursive)` / `writeFile` 跟随，实际把 `deep.txt` 写到目标之外。根目录有效性直到会话提交后才检查，失败时 JSONL 已残留。期望：宿主逐层检查目标内实际目录、默认 no-clobber，先验证目标再写历史。

## 环境与失败证据

基线 `9f4b87ee81b6ec2aa7f1417d23d36745e2e1ac1d`，Windows，Bun 1.4.2 / Node 26.3.1，全部为独立临时目录。`bun scripts/quality/run-vitest.mjs --run --config apps/desktop/vitest.config.ts apps/desktop/src/main/conversations/project-migration-service.test.ts -t '目录链接|无效目标'`：3 条新增回归均失败（旧报告 failed=[]；无效目标后 agent/sessions 已存在）。没有使用真实用户文件。

## 最小复现

1. 使用真实导出函数构造带嵌套文件的 OFAR v2 包。
2. 在另一个临时目标中建立目录 junction/symlink，或用普通文件占据目标根。
3. 运行真实 apply，核对目标外目录、workspace 报告及会话分片。

## 影响与根因

违反 REQ-0026 / ADR-0147 的文件安全和失败语义。词法 `safePath` 不检查实际文件系统；旧附件路径也直接写入，需复用同一宿主安全恢复接缝。无恶意利用或真实数据损害证据，不推断线上事故。

## 回归测试

`project-migration-service.test.ts`：目录链接默认/覆盖两种模式、无效根提前拒绝；`archive-file-restore.test.ts`：常用连续恢复、冲突、并发 no-clobber、硬链接不被原地截断、受控写失败清理和不可移植路径。

## 修复与验证

由 TASK-0361 续接；新增安全恢复模块，验证目标根、根内父目录和叶子类型，默认 no-clobber，显式覆盖采用临时文件 rename 并保留普通权限。附件同字节可重试、异字节拒绝；去重会话仍补齐/验证附件。原 3 条失败回归已绿，最终归档定向六文件 75/75、impact direct50/related78、完整 check exit 0；独立复审关闭两条 P2。详见 Task 2026-10-28 交付证据。真实 UI/双设备、POSIX 执行位与恶意并发目录替换不在已验证范围，保持 verifying。
