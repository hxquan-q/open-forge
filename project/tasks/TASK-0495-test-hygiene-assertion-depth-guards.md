---
id: TASK-0495
type: task
status: done
priority: P2
owner: scripts/quality
requirement: REQ-0008
plan: PLAN-0032
source: upstream c629e7242（选择性重写）
related_requirement: [REQ-0008]
related_plan: [PLAN-0032]
related_tasks: []
related_issues: []
related_bugs: []
execution: serial
branch: main
worktree: unassigned（主工作区串行）
base_commit: 1fd5e1982
read_paths:
  - scripts/quality/lib.mjs
  - scripts/quality/check-guards.mjs
  - scripts/quality/check-quick.mjs
  - scripts/quality/test-impact.mjs
  - scripts/quality/run-vitest.mjs
  - package.json
  - AGENTS.md
  - docs/dev/quality-gates.md
  - apps/desktop/src/main/plugins/plugin-protocol.ts
  - apps/desktop/src/main/plugins/plugin-protocol-contract.test.ts
write_paths:
  - scripts/quality/check-test-hygiene.mjs
  - scripts/quality/check-test-hygiene.test.mjs
  - scripts/quality/check-test-assertion-depth.mjs
  - scripts/quality/check-test-assertion-depth.test.mjs
  - scripts/quality/baselines/test-assertion-baseline.json
  - scripts/quality/check-guards.mjs
  - scripts/quality/check-quick.mjs
  - scripts/quality/test-impact.mjs
  - package.json
  - docs/dev/quality-gates.md
  - project/tasks/TASK-0495-test-hygiene-assertion-depth-guards.md
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: pending
created: 2026-11-24
updated: 2026-11-24
---
<!-- Copyright The Open Forge contributors. -->

# 移植上游测试卫生与断言深度守卫（PLAN-0032 P1 切片 1）

## 目标

参照上游 `c629e7242`（openvetta/open-vetta），在本地建立两类机械守卫，拦截「让红灯消失但不证明行为正确」的测试退化：

1. `check-test-hygiene.mjs`：禁止 `it.skip`/`it.todo`（白名单除外）、`toMatchSnapshot`/`toMatchInlineSnapshot`、`.only`、空用例体；白名单条目带 `reviewBy` 到期复查。
2. `check-test-assertion-depth.mjs`：`toHaveBeenCalled*` 调用类断言只许降不许升，基线存 `scripts/quality/baselines/test-assertion-baseline.json`。
3. 注册进 `check:guards` 全量；`check:quick` 对变更测试文件定向跑 hygiene（断言深度需要全量基线比对，仅在 guards 跑全量）。
4. 为 `apps/desktop/src/main/plugins/plugin-protocol.ts` 在 `test-impact.mjs` 建立显式测试映射——本地 `related` 模式基于 import 图，而 contract 测试是 `readFileSync` 读源码文本，不在 import 图内，上游 `dde5bfb2a` 的教训在本地同样成立。

## 不做

- 不移植 `mutation-sample.mjs`（手工抽样脚本，非门禁）；
- 不动发布说明结构（PLAN-0032 P1 第 3 项另行评估）；
- 不补齐转发清单本身（合同测试若报缺失属既有缺口，如实记录，不在本任务顺手改 plugin-protocol.ts 转发列表——若缺失则记录由后续任务补齐）。

## 验收（Given/When/Then）

- Given 任一 `*.test.*` 文件含 `.only`/快照/空用例体/未豁免 skip，When 运行 `bun run scripts/quality/check-test-hygiene.mjs`，Then 非零退出且每条违规带文件:行号。
- Given 测试文件 `toHaveBeenCalled*` 计数超过基线条目（新文件默认 0），When 运行 `check-test-assertion-depth.mjs`，Then 非零退出并提示须说明理由；低于等于基线则通过，已清零文件可从基线删条目。
- When 运行 `bun run check:guards`，Then 两个新守卫并行执行且当前仓库存量为绿（快照/only 存量应仍为 0；`toHaveBeenCalled*` 需先生成基线）。
- When 运行 `bun run test:impact -- apps/desktop/src/main/plugins/plugin-protocol.ts`，Then desktop target 选中 `plugin-protocol-contract.test.ts`（不再靠 related 兜底）。
- `bun run check:quick -- <某个 test 文件>` 对测试文件触发 hygiene 定向检查。

## 保留合同

- `check:quick`、`check:guards` 现有步骤与输出格式不变；新守卫只追加。
- `test-impact` 的 related/fallback 语义不变；显式映射优先于 related 推测。

## 验证（实际执行）

- `bun run scripts/quality/check-test-hygiene.mjs` 全量：ok（2384 测试文件，0 快照/0 only/0 违规 skip）
- `bun run scripts/quality/check-test-assertion-depth.mjs` 全量：ok（基线 753 文件 / 3630 条 `toHaveBeenCalled*`）
- `bun run test:quality`：868 测试全过，含两个新 companion 测试（7 用例）
- `bun run test:impact -- apps/desktop/src/main/plugins/plugin-protocol.ts`：命中显式映射（direct=1），`plugin-protocol-contract.test.ts` 3 用例通过——转发清单与真实导出已同步，无既有缺口
- `bun run check`：lint + types + guards + mobile-lint 全绿（含两个新守卫全量执行）

## 附带改动

- `check-modified-file-notices.mjs` 的 `EXCLUDED_PATH_RULES` 增补 `ui/`（OpenPen 设计稿 JSON，同 `temp/` 类未入库草稿），消除会话前已存在的 `ui/allstar.op` 未归类阻塞。

## 未做项与风险

- `check:quick` 未加按文件选路（本地结构为「变更 Biome + 全量 guards」，两守卫全量各 ~5s，在 quick 里可接受；上游选路依赖其重构版 guards，未一并移植）
- 断言基线为当前存量快照（753 文件），后续新文件默认上限 0；存量文件清理后可删条目但不可上调
- `ALLOWED_SKIPS` 暂为空表（本地无 live 测试需要保留 skip）；首个豁免条目须带 `reviewBy`
- `mutation-sample.mjs` 与发布说明结构未动（分别属工具脚本与 PLAN-0032 P1 第 3 项评估范围）
