---
id: BUG-0129
type: bug
status: verifying
priority: P1
owner: workspace
requirement:
plan:
source: GitHub Dependabot Alerts (hxquan-q/open-forge)
related_requirement: []
related_plan: []
related_tasks: [TASK-0304, TASK-0305]
related_issues: []
related_bugs: [BUG-0012]
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# Dependabot 第二轮检出 9 项 high 级依赖告警（Electron 39 线新通告 + source-map-js）

## 用户流程

- Given：向 `origin` 推送后，GitHub 在推送回执中提示默认分支存在 high 级 Dependabot 告警。
- When：查看 `https://github.com/hxquan-q/open-forge/security/dependabot` 或调用 Dependabot API。
- Then：仓库依赖应处于无 high 级未修复告警的状态。

## 实际行为

9 条 `open` 状态的 high 告警（2026-10-18 查证；当前无 critical/medium/low 级 open）：

1. `electron` × 8（`apps/desktop/package.json` 与 `packages/remote-desktop/package.json` 各 4 条，当前均锁 `39.8.10`）：
   - GHSA-hq2x-r82h-9wj4（#96/#101）：OpenURLFromTab 打开的弹窗丢失继承的 HTML 沙箱限制，需 `>= 41.10.4`；
   - GHSA-gr2m-v5gq-v685（#95/#100）：沙箱顶层文档打开的窗口不继承其沙箱限制，需 `>= 41.10.6`；
   - GHSA-j84w-jfhq-vhvj（#94/#99）：file/http 协议处理器在未设 corsEnabled 时允许跨源读取，需 `>= 41.10.6`；
   - GHSA-9qh4-3jw8-366w（#93/#98）：`<webview>` 可无视嵌入方限制在 Web Worker 启用 Node.js 集成，需 `>= 41.10.6`。
2. `source-map-js` × 1（`packages/plugins/presets/vetta-ui-design/engine/package-lock.json`，解析为 `1.2.1`）：
   - GHSA-68fv-2mgg-jv7q（#97）：索引型 source-map section 偏移可触发事件循环拒绝服务，需 `>= 1.2.2`。

## 期望行为

- 两个 Electron 清单升至含全部四项补丁的 41 线（`41.10.7`），8 条 electron 告警闭合；
- engine lockfile 中 `source-map-js` 升至 `>= 1.2.2`，#97 闭合；
- 修复合入 GitHub 默认分支并重扫后 `open` 告警归零。

## 环境与失败证据

- 仓库：`hxquan-q/open-forge`（告警挂在默认分支）；查证时间 2026-10-18。
- 命令与输出摘要：`gh api 'repos/hxquan-q/open-forge/dependabot/alerts?state=open' --paginate` → 共 9 条，全部 `high`；按包×清单聚合仅 `electron`（2 个 manifest）与 `source-map-js`（engine lockfile）两个关注点。

## 最小复现

```bash
gh api 'repos/hxquan-q/open-forge/dependabot/alerts?state=open' --paginate --jq '[.[] | select(.security_advisory.severity=="high")] | length'
# → 9
```

## 影响

- Electron 39 线已不再获得官方安全回补（本轮四项通告仅回补 41 线），沙箱/协议/webview 隔离缺陷影响桌面端与远控组件的进程隔离边界；
- `source-map-js` 为 vetta-ui-design engine 的构建期传递依赖，DoS 面限于构建/开发场景，风险低于 Electron 项。

## 根因证据

1. BUG-0012（上一轮 92 项告警）闭合时，`electron` 两侧锁在当时可得的最低补丁基线 `39.8.10`（TASK-0089；曾尝试 44.x 因 Clipboard/PrintToPDF 类型合同破坏面过大回退）。
2. 其后 Electron 新发布的四项安全通告仅回补 41 线（`41.10.4` / `41.10.6`），`39.8.10` 落入各通告受影响区间（`< 41.10.4` / `< 41.10.6`）。
3. `engine/package-lock.json` 将 `source-map-js` 解析为 `1.2.1`（tailwindcss 4.3.3 等以 `^1.2.1`、postcss 以 `^1.0.1` 引入），落入 GHSA-68fv-2mgg-jv7q 的 `< 1.2.2` 区间。

## 回归测试

依赖清单级缺陷，无仓库内可先红后绿的旧实现路径；按 BUG-0012 先例，以升级后类型检查、包内测试与 Dependabot 重扫（open→fixed）作为回归证据。

## 修复与验证

- 修复：TASK-0304（electron → `41.10.7`，两个 manifest + `bun.lock`，零源码适配）；TASK-0305（engine lockfile `source-map-js` → `1.2.2`，3 行最小 diff）。
- 测试：desktop typecheck 0 错误；remote-desktop 7/7；`test:impact` desktop 5035 例全过 / 0 失败（包级 exit 1 归因 BUG-0107 四个存量收集期崩溃文件，单文件复现同签名、机理与 electron 版本无关）。
- 检查：`bun run check:quick` 与完整 `bun run check` 均通过（ratchet new=0）。
- 未运行及原因：真实 Desktop dev 冒烟（UI 验证需授权，交用户）；Dependabot 重扫需变更抵达默认分支。
- 结论：本地修复与验证完成；默认分支为 `origin/main`，Agent 仅按长期授权推 `origin/dev`，告警批量转 fixed 以用户晋升 origin/main 后的重扫为准，在此之前保持 verifying。
