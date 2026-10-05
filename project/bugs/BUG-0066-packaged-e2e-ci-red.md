---
id: BUG-0066
type: bug
status: verifying
priority: P1
owner: desktop packaging
source: CI desktop-packaged workflow E2E jobs (36901450713 / 37056667683 / 37059120967)
related_requirement: [REQ-0004]
related_plan: []
related_tasks: [TASK-0183]
related_issues: [ISSUE-0029]
related_bugs: []
created: 2026-10-03
updated: 2026-10-05
---
<!-- Copyright The Open Forge contributors. -->

# desktop-packaged 的 packaged E2E job 连续红

## 事实

合同 job 与 scope job 修复后（BUG-0064），Linux/macOS/Windows 的 packaged E2E 仍失败（37059120967，2026-10-02）。三个平台 job 都在同一新步骤「Verify staged dependency cleanlist」失败，其后的 packaged Electron smoke / updater E2E 从未执行（步骤显示为跳过）。

## 分型结果（2026-10-05，完整 job 日志）

- 失败步骤：`.github/workflows/desktop-packaged.yml:119` 的 `bun run verify:staged-deps --staging`（由提交 `22efdca00` 引入）。
- 断言输出：`[verify-staged-deps] N violation(s)`，N 分别为 macOS 4、Linux 3、Windows 5；列出的全部是**本平台自己的** prebuild 二进制。macOS job 原文四行：

```text
- node_modules/electron-liquid-glass/prebuilds/darwin-arm64/node.napi.armv8.node
- node_modules/electron-liquid-glass/prebuilds/darwin-x64/node.napi.node
- node_modules/uiohook-napi/prebuilds/darwin-arm64/uiohook-napi.node
- node_modules/uiohook-napi/prebuilds/darwin-x64/uiohook-napi.node
```

- 三类分型（构建失败 / smoke / updater E2E）中只命中「cleanlist 断言」这一类；不是构建失败，也不是 Electron 端到端失败。

## 根因（高置信度）

`--staging` 调用未带 `--platform`，`parseArguments` 回落到 `TARGET_PLATFORM_FAMILIES`（darwin/win32/linux 三族）；而 `planStagedDepStripping` 对多个目标平台做的是**并集**（`apps/desktop/scripts/staged-deps-cleanlist.mjs:297-301` 逐个平台 push 裁剪规则）。三族并集等于裁剪所有平台变体目录，包括当前产物真正需要的那个平台，于是本平台的 prebuild 被判为「应被裁剪却仍在」。

纯函数最小验证（无需打包，秒级）：

```text
platforms: ['darwin']                    -> hits = [prebuilds/linux-x64/…, prebuilds/win32-x64/…]
platforms: ['darwin','win32','linux']    -> hits = [prebuilds/darwin-arm64/…, prebuilds/darwin-x64/…,
                                                    prebuilds/linux-x64/…, prebuilds/win32-x64/…]
```

本机 `bun run verify:staged-deps`（无 `--staging`，即单平台干跑）exit 0，与「只有 `--staging` 扫描红」一致。同一实现的其他调用点（`prepare-pack.js` 按构建平台、`verifyPlatformStagedDependencies` 按单平台）不受影响——缺陷在 `--staging` 调用与多平台并集语义的组合，不是清洗规则本身错误。

置信度：高。CI 断言原文、纯函数复现、本机干跑三处独立证据一致。

## 影响与严重度

P1：packaged E2E 三个平台全红，smoke / updater 回归自 `22efdca00`（2026-09-24）起长期无绿基线。由本仓提交引入（`22efdca00` 在 `main` 可达），非上游问题。

## 回归测试

待补：`--staging` 扫描须只对「单平台产物树」应用该平台的裁剪规则（或让多平台并集在「必须缺席」断言上改为交集），并覆盖三平台各自不缺报。修复 Task 见 [TASK-0183](../tasks/TASK-0183-packaged-e2e-ci-repair.md)。

## 修复与验证

- 方向一：CI 的 E2E 步骤按 `${{ matrix.platform }}` 传 `--platform`，让 `--staging` 只应用本平台规则。
- 方向二：`assertStagedTreeClean` 语义上要求调用方声明产物平台，禁止无平台的全族并集扫描；并加用例锁住该语义。
- 验收阻塞：fork 的 GitHub Actions 预算已耗尽（[ISSUE-0029](../issues/ISSUE-0029-ci-actions-budget-exhausted.md)），当前所有 workflow 秒败于 `an Actions budget is preventing further use`，CI 复跑绿暂不可得。实现与本地/单元级验证可先行。

## 修复与验证（2026-10-05）

- 修复：`--staging`/`--resources` 现要求显式且唯一的 `--platform <darwin|win32|linux>`（`apps/desktop/scripts/verify-staged-deps.mjs` 的 `parseArguments` 抛错）；无树扫描的干跑仍默认三族。CI 的 E2E 步骤按矩阵传 `--platform ${{ matrix.family }}`，矩阵新增 `family` 字段。
- 回归：`apps/desktop/scripts/staged-deps-cleanlist.node-test.mjs` 新增 3 例——缺平台或多平台必须抛错、无树扫描仍默认三族、单平台扫描不把本平台 prebuild 判为应裁剪。
- 验证：`bun run --cwd apps/desktop test:packaging` 125/125；`node --test scripts/staged-deps-cleanlist.node-test.mjs` 21/21；`node --check` 通过；完整 `bun run check` 通过。
- 未运行：CI 复跑（`ISSUE-0029`，Actions 预算未恢复）。因此 packaged E2E 与 smoke/updater 仍未在 CI 上执行过，验收保持 verifying。
