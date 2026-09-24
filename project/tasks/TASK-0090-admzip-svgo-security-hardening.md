---
id: TASK-0090
type: task
status: done
priority: P2
owner: packages/plugins
source: BUG-0012
execution: parallel
branch: forge/dev
worktree: unassigned
base_commit: forge/dev
read_paths: [apps/desktop/package.json, packages/plugins/presets/vetta-ui-design]
write_paths: [apps/desktop/package.json, packages/plugins/presets/vetta-ui-design]
exclusive_paths: [packages/plugins/presets/vetta-ui-design/engine/package-lock.json]
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-24
updated: 2026-09-24
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: [BUG-0012]
---
<!-- Copyright The Open Forge contributors. -->

# adm-zip 与 SVGO 依赖升级及应用层路径遍历安全防御

## 目标

1. 升级 `apps/desktop/package.json` 中的 `adm-zip` 依赖至 `>= 0.6.1`，消除 GHSA-7q85-xj36-vmfc (CVE-2026-77301, High) 与 GHSA-xcpc-8h2w-3j85 (CVE-2026-39244, High) 内存溢出/DoS 漏洞。
2. 针对尚无官方发布的 GHSA-vwc7-r8mq-g2x9 (CVE-2026-76845, Medium 软链接覆写漏洞)，在应用层调用解压处增加目标路径安全性检查（防 Zip Slip / 符号链接遍历）。
3. 升级 `vetta-ui-design` 预设中的 `svgo` 依赖至 `>= 4.1.0`，消除 GHSA-w27v-7q3p-w38r (CVE-2026-84370, High) 与 GHSA-4vpr-x523-8j87 (CVE-2026-84369, Medium) 脚本过滤绕过漏洞。

## 交付记录

- `adm-zip` → `^0.6.1`；根 `overrides` 强制传递依赖也使用该版本；移除已内置类型的 `@types/adm-zip`。
- 新增 `apps/desktop/src/main/archive/safe-zip-extract.ts`：规范化 entry 路径、拒绝符号链接/加密条目、限制条目数与解压体积，并以 `wx` 写文件。
- 插件包解压（`extractPluginArchive`）与自定义 Skill ZIP 导入改为走安全解压。
- 单元测试覆盖合法解压、Zip Slip、重复条目、体积上限与符号链接属性拒绝。
- `vetta-ui-design/engine`：`@iconify/tailwind4` 提升并 `overrides.svgo: ^4.1.0`；`package-lock.json` 解析到 `svgo@4.1.0`。
- 验证：`safe-zip-extract` / `plugin-package` 测试与 `check:quick` 通过。

## 背景事实

- `adm-zip` 在 `apps/desktop` 用于处理主题包、插件或模型归档文件的解压；
- 恶意的 ZIP 文件可能通过伪造超大解压声明触发 OOM DoS，或者通过符号链接跳出解压目录覆盖系统关键文件；
- `svgo` 是矢量图优化组件，旧版本对嵌入式脚本标签与特殊控制字符过滤不彻底，存在 XSS/可执行脚本执行风险。

## 范围

### 并发评估

- **并发结论**：**支持并发**
- **执行方式**：parallel
- **可并行 Task**：`TASK-0087`, `TASK-0088`
- **前置依赖**：无
- **冲突文件/独占路径**：`packages/plugins/presets/vetta-ui-design/engine/package-lock.json`
- **Branch**：`forge/dev`
- **Worktree**：主工作区或独立 Worktree
- **集成负责人**：本 Task 执行者

## 行为规范

- Given：系统支持导入或解压 `.zip` 格式的离线包或插件。
- When：
  1. 将 `adm-zip` 升级至 `0.6.1`；
  2. 针对解压解包逻辑，增加对 entry 路径规范化（防止包含 `..` 或软链接目标跳出 destination 目录）；
  3. 更新 `vetta-ui-design` 引擎中的 `svgo` 依赖至安全版本。
- Then：
  1. 解压合法包功能一切正常；
  2. 恶意构造的 ZIP 无法导致宿主内存泄漏或越界文件覆写；
  3. Dependabot 对应 5 项安全告警关闭。

## 验收标准与验证命令

1. **依赖版本验证**：
   - `adm-zip` 版本 `>= 0.6.1`；
   - `svgo` 版本 `>= 4.1.0`。
2. **安全防御单元测试**：
   - 增加针对解压路径安全过滤的单元测试（校验包含非法相对路径或软链接条目时安全拦截）。
3. **质量门禁**：
   - 运行相关模块测试：`bun run test:impact -- apps/desktop/package.json`。
