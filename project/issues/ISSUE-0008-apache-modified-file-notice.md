---
id: ISSUE-0008
type: issue
status: done
priority: P0
owner: release/compliance
related_requirement: [REQ-0005]
related_plan: [PLAN-0005]
source: Apache License 2.0 §4(b), §4(c), §4(d); repository LICENSE and NOTICE
created: 2026-09-23
updated: 2026-09-23
---

# Apache-2.0 修改文件声明与 Open Forge 归属

## 背景

Apache License 2.0 §4(b) 要求被修改的文件带有显著的修改声明；§4(c) 要求保留适用的上游来源声明；若分发中的上游 Work 包含 NOTICE，§4(d) 要保留其中适用的 attribution notices。当前仓库包含大量继承文件、fork 修改、生成/打包文件和第三方材料，根 `NOTICE` 本身不能自动证明每个 modified file 已满足 §4(b)。

## 已知事实

- 根 `LICENSE` 是 Apache-2.0 正文；根 `NOTICE` 保留 Open Vetta/Vetta 署名以及 pi、Codex CLI、bubblewrap 等第三方记录。
- 当前 Open Forge 公开品牌已确定，但尚无在本条目中确认的 Open Forge 法律权利人/版权主体。
- README/NOTICE 中的项目级来源说明是良好可发现性实践；它不应被当成已自动解决 §4(b) 文件级要求的结论。
- Apache-2.0 本身没有 copyleft 义务；仅通过 API 使用一个可分离的插件，不会自动要求插件开源。复制、改写或分发被许可代码及其他第三方组件仍须单独核验。

## 决策结果（2026-09-23，用户四轮决策确认）

1. **§4(b) 落实方式（选方案一）**：对每个相对上游基线被修改且可注释的文件，文件头统一加单行 `Modified by The Open Forge contributors`；Open Forge 自有新文件加 `Copyright The Open Forge contributors`（不加年份）。配套审计脚本 diff 基线、漏标即 fail closed，未归类新修改文件进清单待分类。
2. **署名主体**：`The Open Forge contributors`。GitHub 身份 `hxquan-q` 非法律实体、无已注册组织名时不虚构；中性署名兼容单人与多人协作，符合 Apache 系项目惯例。
3. **第三方清单审核**：由工程侧对照 `prepare-pack.js` 实际打进发行物的 sidecar/模型/运行时/依赖生成许可证清单草案，用户作为权利主体终审批准；批准证据留在 Task 交付记录。无外部法律顾问渠道，不虚构审核人。

**覆盖范围与排除规则**：所有被修改文件原则上覆盖；`*.json`/锁文件/二进制/图片等不可注释格式、上游已发布 Release Notes 原文、`exprot/` 归档、第三方 vendored 目录列入显式白名单，由审计清单文件兜底声明（注明因格式限制以清单形式声明）。

**审计基线**：动态 `git merge-base upstream/dev HEAD`——每次同步上游后基线自动前移，清单始终反映「相对当前上游的改动」。

## 未决问题（已裁决，存档）

1. Open Forge 对已修改的上游源文件采取什么可验证方式，满足 §4(b) 的文件修改声明要求？
2. Open Forge 自有修改的版权/归属应以个人、组织还是其他经授权主体显示？
3. 当前安装包包含的第三方二进制、模型和依赖的完整许可证/NOTICE 清单由谁审核和批准？

## 候选方案

| 方案 | 收益 | 代价 | 风险 |
|---|---|---|---|
| 给每个被分发的修改源文件添加约定头部/修改声明 | 与 §4(b) 文本直接对应，文件脱离仓库仍可见 | 文件数量多，需处理生成文件、上游同步冲突和现有改动 | 必须确保署名主体真实，不能机械为所有文件添加不准确作者信息 |
| 使用经过法律审核的源码归属清单/头部策略并限定适用文件 | 可按文件来源、是否分发和生成性质精确处理 | 需先完成全仓来源审计和法律确认 | 未经确认不能假设集中清单自动替代 §4(b) |
| 只更新 NOTICE/About，不改文件级声明 | 改动成本低、用户较容易发现来源 | 不能据此断言已满足 §4(b) | 可能形成许可证义务缺口 |

## 推荐

在首次商业或二进制分发前，由有权的 Open Forge 权利人/法律顾问确认 §4(b) 的文件级实施方案和归属主体。工程上保留原 NOTICE，单独增加准确的 Open Forge 来源/修改说明，并建立按 upstream baseline 识别修改文件的审计工具；在法律方案确认前，不声称单靠 About、README 或根 NOTICE 已覆盖全部义务。

## 决策触发条件

- 确认 Open Forge 修改的权利主体及其对外署名；
- 以明确 upstream baseline 生成 modified-file 清单，区分源码、生成物和不随发行物分发的文件；
- 法律负责人书面批准文件级声明模板、第三方清单和排除规则。

## 后续 Task

- `TASK-0055`：给 Desktop 包装布局加入 LICENSE/NOTICE，并建立缺失即失败的包装合同测试。
- `TASK-0044`：完成用户可见品牌和 About 身份；此 UI 改动不替代本 Issue 的文件级法律决策。
- `TASK-0058`：按本 Issue 批准的策略执行 modified-file 审计与文件级声明迁移；决策关闭前保持 blocked。
