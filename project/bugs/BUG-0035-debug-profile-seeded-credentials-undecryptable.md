---
id: BUG-0035
type: bug
status: verifying
priority: P2
owner: apps/desktop
source: verify:ui Debug Profile 实测（dev/debug 双实例对照）
related_requirement: []
related_plan: []
related_tasks: []
related_issues: []
related_bugs: []
created: 2026-09-25
updated: 2026-09-26
---
<!-- Copyright The Open Forge contributors. -->

# Debug Profile 播种复制的 safeStorage 凭据跨 user-data 目录不可解密，Provider 鉴权必失败

## 用户流程

- Given：dev home（`~/.openforge-dev`）已在设置 UI 保存有效的 Provider API key，
  且 `verify:ui` dev 实例 `provider.preflight` 通过；
- When：执行 `bun run --cwd apps/desktop verify:ui:sync:debug` 播种凭据后
  `verify:ui:start:debug`，在 Debug 实例上运行 `provider.preflight` 或
  `conversation.create`；
- Then：播种的凭据在 Debug 实例内正常解密、Provider 鉴权成功。

## 实际行为

- `verify:ui:sync:debug` 报告 `credentialsCopied: 1`，凭据文件已复制；
- Debug 实例 `provider.preflight` 返回
  `DEBUG_PROVIDER_AUTHENTICATION_FAILED`，Provider 侧真实 401（约 85ms 返回，
  解出的密钥为乱码被拒）；
- 在 Debug 实例设置 UI 手工粘贴**同一把** key 后，preflight 立即通过，
  `conversation.create` 真实回合成功——key 本身有效，失效发生在跨实例复制环节。

## 期望行为

- 播种后的凭据可在 Debug 实例正常解密使用；若做不到，文档与脚本应明确说明
  凭据不可播种、要求在 Debug 实例内自行配置。

## 环境与失败证据

- 应用版本：dev main；OS：Windows；Electron 39.x；两个实例同机同 Windows 用户。
- 失败命令：
  `bun run --cwd apps/desktop verify:ui:debug:debug run provider.preflight "{\"modelKey\":\"deepseek/deepseek-flash\"}`
  → `DEBUG_PROVIDER_AUTHENTICATION_FAILED`。
- 对照：dev 实例同 key preflight 通过（约 800ms，返回 usage 18/1）；
  Debug 实例手工录入同 key 后 preflight 与真实会话均通过。

## 根因证据

凭据由 `ElectronSafeStorageCryptography` 用 `safeStorage.encryptString` 加密存为
`desktop-app/credentials/*.credential.json`
（`apps/desktop/src/main/credentials/electron-safe-storage-cryptography.ts`）。
播种实现 `apps/desktop/scripts/ui-verification-profile.ts`（约 226–251 行）
仅做 `copyFileAtomic` 文件级复制，不解密重加密。

Windows 上 safeStorage（Chromium OSCrypt）的 AES 主密钥按 **user-data 目录**
生成，DPAPI 包装后存放在 `<userData>/Local State` 的 `os_crypt.encrypted_key`。
实测两个 user-data 目录 DPAPI 解包后的主密钥不同：

- `~/.openforge-dev/electron-user-data`：SHA256 前缀 `67D96C2A…`
- `~/.openforge-ui-debug/<id>/electron-user-data`：SHA256 前缀 `D72FCBC5…`

因此 dev 实例产生的密文在 Debug 实例 `decryptString` 出乱码 → Provider 401。
机制级证据确凿，置信度高。

## 最小复现

1. dev 实例设置中配置有效 Provider key，`verify:ui:debug:dev run provider.preflight` 通过；
2. `verify:ui:stop:debug` → `verify:ui:sync:debug`（credentialsCopied ≥1）
   → `verify:ui:start:debug`；
3. `verify:ui:debug:debug run provider.preflight` → 401；
4. Debug 实例 UI 手工重填同 key → preflight 通过（证伪「key 失效」）。

## 影响

- Debug Profile 无法复用 dev 凭据，所有需要真实 Provider 的 Debug E2E
  （会话、预检、provider.models 相关流程）在播种路径上必然鉴权失败；
- 实测工作流被迫在 Debug 实例 UI 手工录入密钥，违背「隔离但可用」的设计目标。

## 修复方向

按成本递增排序：

1. **同步 `os_crypt` 主密钥**：播种时把源 `Local State` 的 `os_crypt` 节
   复制进目标 `Local State`（纯文件操作，sync 要求 Debug 已停止，天然无竞态；
   注意目标若已存在独立 `os_crypt` 需先备份，且会改变目标既有密文的解密结果）。
2. **显式导入能力**：新增 Debug 能力 `credentials.import`，经本地 RPC 把明文
   key 交给 Debug 实例自身的 safeStorage 重新加密（跨进程链路需评估明文传输面）。
3. **文档降级**：声明凭据不可播种，仅播种模型配置，引导 `env:FOO` 引用式凭据
   （`env:` 引用在 sanitize 后天然可移植）。

## 回归测试

- 播种后由 Debug 实例对自身凭据执行 `decryptString` 不应得到乱码——可落成
  `verify:ui` 流程内的 health 断言（sync→start 后跑一次 `provider.preflight`
  或轻量 `credentials.check`），使「凭据不可解密」在修复前必失败、修复后通过。

## 修复与验证

- 采用修复方向 1：`verify:ui:sync:debug` 播种凭据时把源 `electron-user-data/Local State`
  的 `os_crypt` 节整体同步进目标 `Local State`（纯文件级同步；同机同 Windows
  用户下 DPAPI 可正常解包，无需解密重加密）。
  - `seedDebugProfile` 仅在 `credentialsCopied > 0` 时同步，结果与 manifest
    新增 `osCryptSynced` 字段；
  - 目标已有不同主密钥时先写 `Local State.os-crypt-backup.json` 留档（不覆盖
    既有备份），目标 `Local State` 的其余字段保留；
  - 源无 `os_crypt`（macOS/Linux safeStorage 路径）时为 no-op，行为不变。
- 回归测试：`ui-verification-profile.test.ts` 新增三例——播种后目标
  `Local State` 携带源 `os_crypt.encrypted_key`；覆盖既有目标密钥时留备份且
  其余字段保留；未复制凭据时不触碰目标 `Local State`。
- 验证：定向测试 8 用例与 `check:quick` 通过。真实 `verify:ui:sync:debug`
  → Debug 实例 `provider.preflight` 链路未实测（需运行真实 Desktop 实例），
  保持 verifying 待复核。
