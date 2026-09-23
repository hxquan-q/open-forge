---
id: TASK-0055
type: task
status: done
priority: P0
owner: apps/desktop
requirement: REQ-0005
plan: PLAN-0005
source_issue: ISSUE-0008
execution: serial
branch: forge/dev
worktree: shared-workspace（与 TASK-0043/TASK-0044 串行集成；保留既有品牌改动）
base_commit: c3d42690fb5b0abc6a5c080d79111747e352728f
read_paths: [LICENSE, NOTICE, README.md, README.zh-CN.md, apps/desktop/AGENTS.md, apps/desktop/scripts/prepare-pack.js, apps/desktop/scripts/desktop-packaging-layout.mjs, apps/desktop/scripts/desktop-packaging-layout.test.mjs, apps/desktop/scripts/verify-packaging-contract.mjs, apps/desktop/scripts/verify-packaging-contract.test.mjs]
write_paths: [apps/desktop/scripts/prepare-pack.js, apps/desktop/scripts/desktop-packaging-layout.mjs, apps/desktop/scripts/desktop-packaging-layout.test.mjs, apps/desktop/scripts/stage-desktop-legal-resources.mjs, apps/desktop/scripts/verify-packaging-contract.mjs, apps/desktop/scripts/verify-packaging-contract.test.mjs]
exclusive_paths: [apps/desktop/scripts/prepare-pack.js, apps/desktop/scripts/desktop-packaging-layout.mjs, apps/desktop/scripts/desktop-packaging-layout.test.mjs, apps/desktop/scripts/stage-desktop-legal-resources.mjs, apps/desktop/scripts/verify-packaging-contract.mjs, apps/desktop/scripts/verify-packaging-contract.test.mjs]
depends_on: []
conflicts_with: [TASK-0043, TASK-0052]
integration_status: pending
created: 2026-09-23
updated: 2026-09-23
---
<!-- Copyright The Open Forge contributors. -->

# Desktop 发行物附带 LICENSE 与 NOTICE

## 目标

确保 Desktop staging 将根 Apache-2.0 `LICENSE` 与完整 `NOTICE` 放入每个平台可读取的稳定资源路径，并由包装合同测试防止后续构建遗漏。

## 范围

### 并发评估

- 结论：不支持与 TASK-0043 并发；两者改动同一打包脚本和 Desktop packaging contract，但本 Task 不依赖品牌代码语义。
- 执行方式：serial，共享工作区；已复验品牌定向测试后由同一集成者顺序修改。
- 可并行 Task：无。
- 前置依赖：根 `LICENSE`/`NOTICE` 保持为来源文件；TASK-0043 当前品牌改动须先完成定向检查并避免并行写入。
- 冲突文件/独占路径：`prepare-pack.js`、`desktop-packaging-layout.mjs`、包装合同与测试。
- Branch：`forge/dev`；Worktree：当前工作区。
- 集成负责人：Coordinator。
- 集成顺序：TASK-0043 → 本 Task → Desktop packaging contract/测试。

### 做

- 从 repo root 读取 `LICENSE` 和 `NOTICE`，复制到 Electron `extraResources` 的专用 `legal/` 目录。
- 在 build/packaging contract 中验证两个文件存在、映射一致且不会仅靠 Linux `license` 元数据代替文件交付。
- 保持 `NOTICE` 中适用的 Vetta/Open Vetta 与第三方 attribution；本 Task 不替换版权主体、不删除或重写第三方许可段落。

### 不做

- 不修改 Apache 2.0 正文或擅自决定 Open Forge 修改的版权权利人。
- 不把 About UI 当作唯一许可证交付渠道；是否增加 UI 链接由 TASK-0044 和用户语言设计决定。
- 不在此 Task 宣称已经解决 Apache §4(b) 文件级修改声明；该法律/工程策略留在 ISSUE-0008。
- 不生成或发布安装包，不签名、不上传发行物。

## Given / When / Then

- Given：Desktop 从干净的 build staging 目录构建 Windows、macOS 或 Linux 制品；When：准备 electron-builder extraResources；Then：包内固定 legal 路径包含完整根 `LICENSE` 和 `NOTICE`，任何文件缺失时包装合同在打包前失败。

## 必须保持

- 根 `LICENSE` 与 `NOTICE` 是唯一来源，不复制一份可漂移的手写文本。
- 每个目标平台使用相同的 notice 内容与相对资源路径。
- 第三方组件许可证仍以实际打包内容为准，不把仓库内但不随包分发的示例误算为二进制依赖。

## 测试与验证

- 定向测试：staging resource 列表包含 `legal/LICENSE`、`legal/NOTICE`；合同校验能识别缺失根文件或错误映射。
- 用户流程：在 Desktop 构建 staging/安装目录中能从固定路径读取 Apache License 和第三方 NOTICE；不需要启动真实用户 Desktop。
- 质量检查：`node --test apps/desktop/scripts/desktop-packaging-layout.test.mjs`、`bun run verify:desktop:contracts`、`bun run --cwd apps/desktop test:packaging` 中受影响项。

## 发布阻断

- ISSUE-0008 阻断商业发行合规结论，但不阻止把现有 LICENSE/NOTICE 纳入 staging 并测试资源布局。
- TASK-0043 的品牌定向测试、Desktop packaging tests 和 contracts 通过；Desktop typecheck 仍因当前工作区其他 project/runtime 改动报错，故 TASK-0043 保持 verifying，本 Task 与其串行集成，不覆盖该验证记录。

## 交付记录

- 实际修改：`desktop-packaging-layout.mjs` 新增 `DESKTOP_LEGAL_FILES` 与 `DESKTOP_LEGAL_RESOURCE`（`legal → legal`）；新增 `stage-desktop-legal-resources.mjs` 从仓库根复制 `LICENSE`/`NOTICE` 到 staging 且缺源文件即抛错；`prepare-pack.js` 在清理 staging 后立即调用 staging helper 并把 legal 资源追加进 `extraResources`（filter 克隆防漂移）；`verify-packaging-contract.mjs` 校验根文件存在、映射未被改写且 prepare-pack 实际消费合同。
- 实际运行：`node --test apps/desktop/scripts/desktop-packaging-layout.test.mjs` → 4 测试通过（含逐字节比对）；`bun run --cwd apps/desktop verify:packaging:contract` → `[desktop-packaging-contract] ok`；`bun run --cwd apps/desktop test:packaging` → 75 测试通过；`check:quick` 对本批文件 Biome 干净。
- 未运行及原因：真实 electron-builder 安装包产物检查（本 Task 明确不生成/发布安装包）；三平台实机核验留给首发前集成验证。
- 剩余风险：Apache §4(b) 文件级 modified-file notice 策略仍须单独决策（ISSUE-0008 → TASK-0058）；发行物内第三方组件清单审计待 ISSUE-0008 第 3 问确认。
