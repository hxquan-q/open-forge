---
id: VERIFY-0018
type: verification
status: done
priority: P1
owner: apps/desktop
source: user-request（「测试当前的应用，可以使用 qwen3.8 这个有效的模型」）
created: 2026-10-08
updated: 2026-10-08
related_requirement: []
related_plan: []
related_tasks: []
related_issues: [ISSUE-0031]
related_bugs: []
---
<!-- Copyright The Open Forge contributors. -->

# qwen3.8 真实 Provider 冒烟：应用链路成立，模型端点输出不连贯

## 被验证的合同

Debug Profile 下「新建会话 → 真实 Provider 调用 → 多轮续聊 → 持久化与 usage 归一化 → Prompt 缓存」的最小闭环，模型 `qwen3.8/qwen3.8-27b`。按 [Vetta Debug 真实 Provider 实战](../../docs/dev/vetta-debug-real-provider-runbook.md) 的口径执行。

## Given / When / Then

- Given：已就绪的 Debug 实例与有效凭据；When：对 `qwen3.8/qwen3.8-27b` 执行 `provider.preflight`；Then：返回 `status: ready` 与 usage。
- Given：隔离空工作区；When：`conversation.create` 下发 Todo + 读文件任务；Then：回合到 `completed`、`stopReason: stop`、会话 JSONL 落盘、usage 归一化。
- Given：同一 `sessionPath`；When：`conversation.continue` 第二轮；Then：前缀 `extended`、`changedSegments` 为空、`cacheRead` 真实命中。
- Given：最小判别输入「只回复两个字：你好」；When：分别用 qwen3.8 与对照模型 `glm/glm-5.3-flash` 建会话；Then：用于定位不连贯输出的责任边界。

## 环境与输入

- 提交：`f7a67da2b`（实测期间他人有 `571cfa26e→f7a67da2b` 的并行 docs 提交，均为 project 台账）；工作区另有 `bun.lock` 未提交修改，与本测试无关。
- Windows 11 x64、Bun 1.4.2、Debug Profile `04987e4e`（`~/.openforge-ui-debug/04987e4e`，status 满足 running/ready/reachable/targetFound）。
- 隔离工作区 `C:\Users\xquan\AppData\Local\Temp\vetta-qwen38-smoke`（仅一个 README.txt）。
- `executionMode: "full-access"`：win32 无沙箱宿主 binary（`sandbox` 返回 `binary_not_found`），且该 Profile `desktop-config.json` 自身 `defaultExecutionMode` 即 `full-access`。
- qwen3.8 端点 `http://183.36.30.83:18081/v1`（`openai-responses`），对照 glm 端点 `http://183.36.30.83:16800/v1`（同 adapter）。

## 实际命令与 CI 记录

```text
bun run verify:ui:debug:debug -- run provider.preflight '{"modelKey":"qwen3.8/qwen3.8-27b","timeoutMs":60000}'
bun run verify:ui:debug:debug -- run provider.models.list '{}'
bun run verify:ui:pw:debug -- snapshot / console
```

中文 JSON 经 `bun run` → `bun scripts/ui-verification.mjs` → `spawnSync(bun debug-cli)` 的命令行链路在 Git Bash 下被破坏（`ARGUMENT_ERROR json-input must be valid JSON`）；改用磁盘 `input.json` + 本地 `spawnSync` 携带 `VETTA_ACTION_RPC_ENDPOINT_FILE` 直调 `apps/cli-host/src/debug-cli.ts`，请求与结果合同不变。

## 结果（2026-10-08）

| 项 | 结果 |
|---|---|
| `provider.preflight` | `ready`，`credentialKind: api-key`，144ms，`stopReason: stop`，usage 30/2，`cacheUsageReporting: read-only` |
| `provider.models.list` | 8 个本地模型，`qwen3.8/qwen3.8-27b` 在列（contextWindow 128000） |
| create 第 1 轮 | `completed`/`stop`，in=34174、out=17；回复为一句无关英文清单行，**未调用 Todo/读文件** |
| continue 第 2 轮 | `completed`/`stop`，in=946、cacheRead=33280、out=1263；`prefixStatus: extended`、`changedSegments: []`，缓存读命中率 97.2% —— 前缀追加与缓存链路健康；**输出为复述系统提示/技能片段的不连贯长文，未执行任务** |
| create 极简 prompt（qwen3.8） | `completed`/`stop`，输出仍为不连贯英文片段，未按要求回复「你好」 |
| 对照 glm-5.3-flash 同 prompt | `completed`/`stop`，精确回复「你好」——证明同一 adapter、装配与凭据链路正常 |
| Renderer UI | snapshot 正常呈现主界面与会话列表；2 条 `browser-view:passthrough`/`setIgnoreMouseEvents` console error 为既有问题，与本次无关 |

结论：应用侧合同（鉴权、目录、会话生命周期、持久化、usage 归一化、Prompt 缓存）全部通过；不连贯输出定位于 qwen3.8 端点/模型本身，已立案 [ISSUE-0031](../issues/ISSUE-0031-qwen38-endpoint-incoherent-output.md)。

## 未运行的验证与原因

- `payload`/`wire` 观测档：需重启 Debug 实例并设置 `VETTA_PROVIDER_OBSERVATION_CAPTURE`，本次未中断在跑实例。
- Fresh Profile、打包制品、其余模型逐一回归、Todo 跨轮状态核对：超出本次冒烟范围。
- 费用：qwen3.8 端点未上报价格字段，成本不可核算。

## 剩余风险

- qwen3.8-27b 当前对任何 prompt 输出均不可用，依赖该模型的流程全部受影响；若根因在网关 `/responses` 实现，同端点其它模型可能同样受累。
- 命令行中文 JSON 被破坏的路径未定位到具体层；`debug` CLI 只接受内联 JSON，建议补 `--input-file` 类入口。
