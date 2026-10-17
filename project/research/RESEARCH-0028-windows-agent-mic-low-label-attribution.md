---
id: RESEARCH-0028
type: research
status: done
priority: P2
owner: project
source: BUG-0128
related_requirement: []
related_plan: []
related_tasks: [TASK-0303]
related_issues: []
related_bugs: [BUG-0128]
created: 2026-10-18
updated: 2026-10-18
---
<!-- Copyright The Open Forge contributors. -->

# Windows agent 沙箱 MIC Low 标签手法与 BUG-0128 归因定案

## 1. 问题与范围

BUG-0128 中仓库树被整体打上继承式 Low 强制完整性标签的**来源归因**：确定打标工具、排除误判对象、验证修复手段。范围为本机取证与上游源码/文档证据，覆盖 DeepSeek Harness（DSH）、gemini-cli、OpenAI Codex 与 Chromium 缓解策略；不含上游 issue 提交（另行执行）。

## 2. 来源

- 上游文档/源码：DSH `packages/sandbox/sandbox-windows-acl/README.md`（workspace-write 三件套、"never revoked"、"outlives DSH"）；DSH Discussions #8048（同症状：`error_code=18` / `0x80000003` / `(OI)(CI)(NW)` Low，含残留清理 PowerShell 脚本）与 #7709；gemini-cli `docs/cli/sandbox.md` 与 `GeminiSandbox.cs`/`WindowsSandboxManager.ts`；OpenAI Codex Windows 沙箱官方博客（否决 MIC 的 "low-integrity sink" 论述）；微软 MIC 文档（进程完整性取用户与文件较低值）；Chromium `security_level.h`（`MITIGATION_IMAGE_LOAD_NO_LOW_LABEL=0x80000`）与 `sandbox_win.cc`（对所有沙箱子进程启用，142/branch-heads/7444 同）。
- 本机取证（2026-10-17 晚）：仓库根 ACL 全量（icacls）；`~/.dsh` 会话与 `storages/workspace.json`；`~/.gemini*` 活动核查；codex.exe 0.163.0 二进制字符串探针；`openai/codex` 源码检索（gh）；临时目录标签继承/传播实验；Electron dist 自愈前后对照。

## 3. 结论

1. **打标者定案：DSH（deepseek-harness）**，工具级高置信：
   - 指纹逐位吻合其 README 描述的 workspace-write 三件套——能力 SID 允许 ACE（现场 `S-1-4-243177478-769424498:(OI)(CI)(W,D,DC)`）、上层删除权拒绝（`Everyone:(CI)(DENY)(DC)`）、继承式 Low 标签；
   - 时间证据：`~/.dsh/sessions/--C-Users-xquan-Desktop-open-forge--/session-7f930410…/session.v4.jsonl.zstd` 最后写入 `03:19:55.229`，与标签窗口结束（03:19:54）秒级吻合；另一会话 `0267d2ae` 存活 03:01→04:10 全程覆盖；
   - 行为模式吻合："每工作区每机一次" ↔ 现场一次性打标；
   - gemini-cli 指纹全部缺席：根 DACL 无 Low SID `(M)` 授权、`~/.gemini/tmp` 无标签、无 `.geminiignore`，且 10-17 当天 `~/.gemini` 零文件活动。
   - 会话级未钉死：`session-7f930410` projcache 有 `"danger-full-access"` 片段（疑来自另一次 resume），具体触发会话与模式在 zstd transcript 内未解压。
2. **机制链**：DSH 物化 Low 标签（不回收）→ NTFS 继承扩散全树 → Chromium 沙箱子进程 `IMAGE_LOAD_NO_LOW_LABEL` 拒载 Low 映像 → `SBOX_ERROR_CREATE_PROCESS=18`，GPU/renderer 同时失败。
3. **修正早前"dist 以外 Low 无害"的错误判断**：按 MIC 取低值规则，树内任何 Low 标签 exe（如 node_modules 内的 esbuild.exe）启动即为 Low 进程，向 %APPDATA%/%LOCALAPPDATA%/Temp 等树外 Medium 目标写入全部被拒——全树标签必须整体重置，而非只救 electron dist。
4. **修正 gemini-cli 行为描述**：其沙箱默认关闭（`security.toolSandboxing=false`），启用后经 `GeminiSandbox.exe` **每条沙箱命令**重打 `S:(ML;OICI;NW;;;LW)`（非"一次"），退出同样不恢复；其 fork 约 23 个仓库、该 SDDL 片段全 GitHub 约 498 处命中——手法是品类问题，启动器自愈防线对整类工具成立。
5. **修复手段已实验证实**：仅在根执行 `icacls <root> /setintegritylevel "(OI)(CI)Medium"`，NTFS 继承自动把全树 `(I)` 标签翻转为 Medium，秒级完成、无需 `/T` 遍历；electron dist 的显式 Medium 标签不受影响。icacls 无删除标签选项，设为 Medium 等效（无标签对象按 Medium 对待）。
6. **上游路由**：同症状既有报告在 `deepseek-ai/deepseek-harness` Discussions #8048 / #7709，后续报告应投该处；gemini-cli 的同类问题独立成立但非本案。

## 4. 被否决的方案与原因

- **Codex CLI 打标**（BUG-0128 原归因）：`openai/codex` 源码 0 处 `setintegritylevel`；本机 codex.exe 0.163.0 二进制无相关字符串；`cap_sid` 为 `S-1-5-21-*` 合成 SID 方案（区别于 DSH 的 `S-1-4-*`）；官方博客明确 MIC 方案设计期被否决。根 ACL 上 `CodexSandboxUsers:(I)(M,DC)` 为继承授权，与标签无关。Codex 另有 AppContainer ACE 破坏 Electron 的机制（#53272/#15777），现场无 `S-1-15-2-*` 条目，不适用。
- **gemini-cli/Antigravity 打标**：指纹全无 + 当天零活动 + 行为模式不符（见结论 1）；Antigravity 的 Electron 受损报告为 AppContainer SID 残留，非本症。
- **Open Forge 自身 runtime sandbox**：不打完整性标签（源码检索确认），事发时未运行。
- **"仅修 electron dist 即彻底解决"**：对 Chromium 故障充分，但被结论 3 的取低值规则否决，必须全树重置。

## 5. 代码锚点与检测命令

- 自愈实现：`apps/desktop/scripts/run-dev-electron.mjs`（`repairElectronIntegrityLabelIfNeeded`，探测正则 `\(ML;[^)]*;LW\)`）。
- 检测：`icacls <path>`（看 `Mandatory Label` 行）；批量 SDDL 探针 `icacls <root> /save <file> /T /C /Q`（UTF-16LE）；`accesschk -e -s <root>`。
- 本机取证路径：`~/.dsh/sessions/--C-Users-xquan-Desktop-open-forge--/`、`~/.dsh/storages/workspace.json`（open-forge 自 2026-10-01 注册，7 个会话）。
- Git Bash 陷阱：MSYS 路径转换会毁掉 icacls 的 `/setintegritylevel` 参数，须用 cmd/PowerShell 或 `MSYS_NO_PATHCONV=1`。

## 6. 结论失效条件

- DSH transcript（zstd）解压后证据推翻会话时间线；
- DSH 新版改为退出恢复标签或弃用 MIC（上游 #8048 方向）；
- 仓库根 ACL 被整体重写导致指纹消失，且新标签事件再现——需按第 5 节命令重新取证归因。

## 7. 下一步触发信号

- 仓库根标签再次变为 Low：用根 ACL ChangeTime 锁定时间窗，对账 `~/.dsh/sessions/` 各会话 transcript mtime（本次方法已验证）；若 reuse cache 使 DSH 跳过重打，则风险自消。
- 向上游提交报告（deepseek-harness，接 #8048/#7709；素材见本记录与 TASK-0303 交付物）。
- 需要清除 DSH 的 DACL 残留（`S-1-4-*` 授权与 Everyone deny）时，用 #8048 的 PowerShell 脚本（`icacls /remove` 对未映射 SID 报 1332）。
