<!-- Modified by The Open Forge contributors. -->

# Windows Sandbox 中文文档

本文档面向 `codex-rs/windows-sandbox-rs`，聚焦独立可执行入口
`codex-windows-sandbox-host.exe` 的参数、策略和排障。

## 文档索引

- [sandbox-host-cn.md](/C:/me/codex/codex-rs/windows-sandbox-rs/docs/zh-CN/sandbox-host-cn.md)
  - `codex-windows-sandbox-host.exe` 全量参数说明、默认值、示例
- [policy-and-roots-cn.md](/C:/me/codex/codex-rs/windows-sandbox-rs/docs/zh-CN/policy-and-roots-cn.md)
  - `--policy`、`--read-root`、`--write-root`、`--deny-write-path` 的行为和覆盖关系
- [troubleshooting-cn.md](/C:/me/codex/codex-rs/windows-sandbox-rs/docs/zh-CN/troubleshooting-cn.md)
  - 常见报错与定位步骤

## 快速开始

```powershell
cd C:\me\codex\codex-rs
cargo build -p codex-windows-sandbox --bins

.\target\debug\codex-windows-sandbox-host.exe --policy workspace-write -- cmd /c "echo hello"
```

注意：

- 命令参数分隔符 `--` 之后的内容会被视为“要在沙盒中执行的命令”。
- 运行时状态目录默认在 `CODEX_HOME`（若未设置则回退到 `%USERPROFILE%\.codex` 或 `<cwd>\.codex`）。

## 打包期的制品完整性（TASK-0159）

产物里的沙盒 exe 由**受控构建**产出，放进 `packages/runtime-core/sandbox/bin`（二进制不入库），并登记到受控清单 `packages/runtime-core/sandbox/windows/sandbox-artifacts.json`：

- 清单记录制品来源提交（`sourceCommit`）与每个 exe 的 SHA-256；
- 打包（`prepare-pack.js`）逐个核对存在性与摘要，缺失或不一致**默认中断构建**（`Resources/sandbox/windows/` 不再靠「目录非空」冒充有沙盒）；
- 只有显式设置 `VETTA_SKIP_SANDBOX_ARTIFACT_CHECK=1`（明确接受本次产物不带 Windows 沙盒）时才降级为告警，此时用户侧得到 `sandbox.status=unavailable`。

升级制品后重新钉摘要并校验：

```bash
node apps/desktop/scripts/windows-sandbox-artifacts.mjs --write --source-dir packages/runtime-core/sandbox/bin --commit <制品来源提交>
node apps/desktop/scripts/windows-sandbox-artifacts.mjs
```

本仓不从网络下载沙盒制品：来源只能是受控构建产物。
