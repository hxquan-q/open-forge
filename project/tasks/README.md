<!-- Copyright The Open Forge contributors. -->
# Tasks

Task 是可独立验证和回滚的工作项；状态、范围与交付证据以原 Task 文件为准。先按下面的命令定位，协调多个任务时才读焦点表。

## 按需读取

在仓库根执行，替换示例 ID 或主题：

```powershell
rg --files project/tasks -g 'TASK-0421-*.md'
rg -l -i '主题关键词' project/tasks -g 'TASK-*.md'
rg -n '^status: (draft|ready|in_progress|blocked|verifying)$' project/tasks -g 'TASK-*.md'
```

只打开命中的 Task 及本次相关来源；续接时核对 diff 与已有验证。需要历史时查询原文件，路径和 ID 不变；旧协调摘要可查 `git log -p -- project/tasks/README.md`，不复制历史状态到新台账。

## 建立与维护 Task

- 关联已有 REQ、BUG 或 ISSUE；没有来源时按 [记录路由](../CONVENTIONS.md#记录路由选择哪种文档)建立最小组合。
- 局部串行维护用 [轻量范本](templates/task-light.md)；并行、迁移或复杂行为用 [完整模板](templates/task.md)。元数据照旧，正文只写实际相关合同。
- 新编号扫描本目录全部 `TASK-*.md`，包括未提交文件；焦点表不是编号全集。
- 实施前将合同、`in_progress` 与焦点行落盘；具体准入见 [管理规范](../CONVENTIONS.md#实施前记录)。范围或验证变化回写原 Task。
- 焦点表保留未关闭任务的 ID、状态、Plan 与短链接；完成/归档时移出，重新开启时补回。结果和日志留原 Task。此表与 frontmatter 同步，由 `check-project-indexes.mjs` 校验；控制器仍使用本文件更新状态。
- 需要并行/集成时读 [协作流程](../collaboration/development-workflow.md)；串行任务无需展开 Worktree 操作。完成状态按 [交付合同](../../.agents/skills/open-forge-task-intake/references/delivery.md)判断。

## 当前执行焦点

仅用于跨任务协调；单任务用上面的查询定位。选入条目不代表获得实施或发布授权。

| Task ID | 状态 | Plan | 任务（详情见原记录） |
|---|---|---|---|
| `TASK-0461` | `verifying` | PLAN-0029 | [模型探测与余额通道迁移到 Host 合同](TASK-0461-models-probe-host-domain.md) |
| `TASK-0460` | `verifying` | — | [weknora AC-20 时序用例偶发修复](TASK-0460-weknora-ac20-flake-fix.md) |
| `TASK-0459` | `verifying` | PLAN-0029 | [模型配置域迁移到 Host 合同](TASK-0459-models-config-host-domain.md) |
| `TASK-0458` | `verifying` | PLAN-0029 | [模型预设目录迁移到 Host 合同](TASK-0458-models-preset-catalog-host-domain.md) |
| `TASK-0457` | `done` | — | [docs-site MDX frontmatter 修复](TASK-0457-docs-site-mdx-frontmatter-fix.md) |
| `TASK-0456` | `done` | — | [autonomy 文档同步推送后候选核验](TASK-0456-autonomy-docs-candidate-verify-sync.md) |
| `TASK-0455` | `done` | PLAN-0029 | [requirement-run 条款级证据关联](TASK-0455-requirement-run-clause-evidence.md) |
| `TASK-0454` | `done` | PLAN-0029 | [评审独立：只读候选与独立上下文](TASK-0454-controller-review-isolation.md) |
| `TASK-0453` | `verifying` | PLAN-0029 | [host-protocol 骨架、进程内 Host 与“设置”领域试点](TASK-0453-host-protocol-in-process-host-pilot.md) |
| `TASK-0452` | `done` | PLAN-0029 | [真实 adapter 端到端验收任务](TASK-0452-controller-real-adapter-e2e.md) |
| `TASK-0451` | `done` | PLAN-0029 | [候选提交与 CI 证据绑定](TASK-0451-controller-candidate-ci-review-binding.md) |
| `TASK-0450` | `done` | PLAN-0029 | [研发控制器集成目标配置化](TASK-0450-controller-integration-target-config.md) |
| `TASK-0449` | `done` | PLAN-0029 | [Desktop 包边界小修与仓库地图补全](TASK-0449-desktop-boundary-small-fixes.md) |
| `TASK-0448` | `in_progress` | PLAN-0029 | [Desktop 分进程资源基线测量脚本与基线记录](TASK-0448-desktop-resource-baseline-script.md) |
| `TASK-0446` | `verifying` | — | [Use portable local temp fixtures for remote POSIX path tests (BUG-0181)](TASK-0446-runtime-node-remote-path-tests-use-posix-tmp.md) |
| `TASK-0445` | `verifying` | — | [Select the exposed chunk in the plugin-vite shared React test (BUG-0180)](TASK-0445-plugin-vite-test-selects-bootstrap-chunk.md) |
| `TASK-0444` | `verifying` | PLAN-0014 | [Scripts 面板补齐中英文案与插值合同（BUG-0081）](TASK-0444-scripts-panel-locale-contract.md) |
| `TASK-0443` | `verifying` | — | [Normalize Windows TEMP aliases for agent Git snapshots (BUG-0179)](TASK-0443-windows-temp-short-path-git-root-check.md) |
| `TASK-0442` | `verifying` | PLAN-0028 | [Ignore stale AI edit targets on file-panel mount (BUG-0178)](TASK-0442-stale-edit-target-replayed-on-panel-mount.md) |
| `TASK-0441` | `verifying` | — | [Desktop fallback executable paths match packaged identity (BUG-0111)](TASK-0441-desktop-executable-fallback-paths.md) |
| `TASK-0440` | `verifying` | PLAN-0014 | [提示音事件接入桌面渲染层（BUG-0080）](TASK-0440-notification-sound-event-wiring.md) |
| `TASK-0439` | `verifying` | PLAN-0028 | [Team 首发 handoff 失败不再自动重发（BUG-0177）](TASK-0439-handoff-failure-loop.md) |
| `TASK-0438` | `verifying` | PLAN-0028 | [Team 工作区校验纳入开发册（BUG-0176）](TASK-0438-team-workspace-dev-book.md) |
| `TASK-0437` | `verifying` | PLAN-0028 | [CREATE 返回透传会话档位（BUG-0174）](TASK-0437-create-returns-profile.md) |
| `TASK-0436` | `verifying` | PLAN-0028 | [文件页签卸载不再回拉面板宽度（BUG-0175）](TASK-0436-unmount-preview-width.md) |
| `TASK-0435` | `verifying` | PLAN-0028 | [编辑目标按来源身份过滤（BUG-0173 / F03）](TASK-0435-edit-target-cross-workspace.md) |
| `TASK-0434` | `verifying` | PLAN-0028 | [LLM 行为热追踪收敛为 code 模式独有（REQ-0030 / 报告 §11.3）](TASK-0434-hot-tracking-code-only.md) |
| `TASK-0433` | `verifying` | PLAN-0028 | [新建 code 会话恢复四页签默认（BUG-0172）](TASK-0433-new-session-tab-defaults.md) |
| `TASK-0432` | `verifying` | PLAN-0028 | [新建 code 会话意图驱动布局初始化（BUG-0171）](TASK-0432-coding-create-intent.md) |
| `TASK-0431` | `verifying` | PLAN-0028 | [终端条目完成结算与聊天闸门解耦（BUG-0170）](TASK-0431-terminal-entry-stuck-running.md) |
| `TASK-0430` | `verifying` | PLAN-0028 | [coding 增量行侧栏漏过滤修复（BUG-0169）](TASK-0430-incremental-coding-sidebar-leak.md) |
| `TASK-0429` | `verifying` | PLAN-0028 | [同一 AI 文件再次编辑跟回内嵌预览（BUG-0168）](TASK-0429-ai-file-edit-refollow.md) |
| `TASK-0428` | `verifying` | PLAN-0028 | [开发册项目闭环：候选与补拉以版块册为事实源（BUG-0167）](TASK-0428-allstar-book-project-closure.md) |
| `TASK-0427` | `verifying` | PLAN-0028 | [修复终端输出摘要内存保留（BUG-0166）](TASK-0427-terminal-output-retention.md) |
| `TASK-0426` | `verifying` | PLAN-0028 | [修复 Git 页签分支名解析（BUG-0165）](TASK-0426-git-branch-status-parse.md) |
| `TASK-0425` | `verifying` | PLAN-0027 | [Code 模式会话独立、初始化与 LLM 热跟踪总体检测](TASK-0425-code-mode-comprehensive-audit.md) |
| `TASK-0423` | `in_progress` | PLAN-0027 | [M1 版块壳：/allstar 专属路由、项目空间、会话管理与配置 v1](TASK-0423-allstar-dev-section-shell.md) |
| `TASK-0419` | `verifying` | — | [后台终态与新会话列表刷新合并为一次](TASK-0419-weknora-background-refresh-coalesce.md) |
| `TASK-0418` | `verifying` | — | [SSH 握手预算不再被建连前时钟吃掉](TASK-0418-ssh2-handshake-budget-floor.md) |
| `TASK-0417` | `verifying` | — | [Worktree 准备沿用控制器运行时](TASK-0417-agent-prepare-controller-runtime.md) |
| `TASK-0416` | `verifying` | — | [控制器进程测试的取消、收尾与独立建库夹具](TASK-0416-agent-test-fixture-lifecycle.md) |
| `TASK-0415` | `verifying` | — | [候选差异批量读取与安全分类语义保持](TASK-0415-agent-git-change-batching.md) |
| `TASK-0414` | `verifying` | — | [市场流程测试的 manifest 网络隔离](TASK-0414-marketplace-test-network-isolation.md) |
| `TASK-0413` | `verifying` | — | [CLI Runtime 合同测试的记忆包源码解析](TASK-0413-cli-runtime-source-resolution.md) |
| `TASK-0412` | `verifying` | — | [Desktop 交付失败基线复核与组合门禁](TASK-0412-desktop-delivery-baseline.md) |
| `TASK-0410` | `verifying` | PLAN-0026 | [共享资源 gate 的可取消、有界、公平准入与 OCR 接线](TASK-0410-shared-resource-admission.md) |
| `TASK-0409` | `verifying` | PLAN-0025 | [设计方向选择与质量检查闭环](TASK-0409-design-direction-quality.md) |
| `TASK-0408` | `verifying` | PLAN-0025 | [设计画布真实图片搜索、导入与来源追溯](TASK-0408-design-real-image-assets.md) |
| `TASK-0407` | `verifying` | PLAN-0025 | [设计画布首屏、卡顿与闪白修复](TASK-0407-design-canvas-stability.md) |
| `TASK-0406` | `verifying` | PLAN-0025 | [MCP 候选服务启动失败后的退避重试](TASK-0406-mcp-candidate-retry.md) |
| `TASK-0405` | `in_progress` | — | [发布未签名的 Open Forge 0.1.3](TASK-0405-release-0-1-3-unsigned.md) |
| `TASK-0404` | `in_progress` | — | [GitHub 到 Codeup 单向同步与云效构建测试](TASK-0404-yunxiao-sync-and-ci.md) |
| `TASK-0392` | `verifying` | PLAN-0006 | [内置浏览器与 Agent 联动及标签栏性能](TASK-0392-browser-agent-tabs.md) |
| `TASK-0391` | `verifying` | — | [新增 macOS 测试包手动构建工作流](TASK-0391-desktop-macos-test-workflow.md) |
| `TASK-0390` | `verifying` | PLAN-0021 | [记忆交付后复核修复与正常入口闭环](TASK-0390-memory-postreview-fix-loop.md) |
| `TASK-0389` | `draft` | PLAN-0021 | [可选多跳关系或概要检索消融实验](TASK-0389-memory-graph-ablation.md) |
| `TASK-0387` | `draft` | PLAN-0021 | [项目记忆的可选迁移包与副本隔离](TASK-0387-memory-project-archive.md) |
| `TASK-0386` | `draft` | PLAN-0021 | [IM 记忆身份选择与 legacy 兼容适配](TASK-0386-memory-im-identity-adapter.md) |
| `TASK-0385` | `draft` | PLAN-0021 | [CLI 显式策略与跨会话记忆接入](TASK-0385-memory-cli-host-integration.md) |
| `TASK-0384` | `draft` | PLAN-0021 | [经验晋升、软衰减与可重建摘要](TASK-0384-memory-experience-evolution.md) |
| `TASK-0383` | `draft` | PLAN-0021 | [迟到更正、历史已知视图与冲突状态](TASK-0383-memory-bitemporal-queries.md) |
| `TASK-0366` | `verifying` | PLAN-0006 | [注入 guest 的垫片对 deps 实参可见](TASK-0366-browser-guest-name-helper-scope.md) |
| `TASK-0365` | `verifying` | PLAN-0006 | [点选在指针按下时打开元素旁的批注](TASK-0365-browser-picker-pointerdown.md) |
| `TASK-0362` | `verifying` | — | [内置浏览器占位洞平移后原生视图跟着走](TASK-0362-browser-view-bounds-follow-layout.md) |
| `TASK-0361` | `verifying` | — | [项目迁移包：OFAR v2 + cwd 重写导入 + 产物打包（REQ-0026 / ADR-0147）](TASK-0361-project-migration-archive.md) |
| `TASK-0360` | `verifying` | PLAN-0006 | [浏览器元素 Shift+点击多选](TASK-0360-browser-element-multi-select.md) |
| `TASK-0359` | `verifying` | PLAN-0020 | [Windows远程输入类型初始化幂等](TASK-0359-native-input-type-idempotency.md) |
| `TASK-0358` | `verifying` | PLAN-0020 | [Desktop测试日志与真实数据根隔离](TASK-0358-desktop-test-log-isolation.md) |
| `TASK-0357` | `verifying` | PLAN-0020 | [HostedRoute能力注册与模块重载一致性](TASK-0357-hosted-route-provider-lifecycle.md) |
| `TASK-0356` | `verifying` | PLAN-0020 | [插件Hook派发与渲染端代次生命周期对齐](TASK-0356-plugin-hook-generation-lifecycle.md) |
| `TASK-0355` | `verifying` | PLAN-0020 | [启动paint与超时分流及阶段观测](TASK-0355-startup-paint-observation.md) |
| `TASK-0354` | `verifying` | PLAN-0020 | [远端会话资源加载去重与有界等待](TASK-0354-remote-resource-initialization.md) |
| `TASK-0353` | `verifying` | PLAN-0020 | [消息历史与live合并身份去重及可读诊断](TASK-0353-conversation-identity-reconciliation.md) |
| `TASK-0352` | `blocked` | PLAN-0020 | [Windows沙箱制品完整性与运行时定位](TASK-0352-windows-sandbox-artifact-repair.md) |
| `TASK-0351` | `verifying` | PLAN-0006 | [点选元素后与 Agent 对话并改页面](TASK-0351-browser-element-agent-edit.md) |
| `TASK-0349` | `verifying` | — | [完善会话管理闭环：项目会话导出、导入后即时可见与反馈体验](TASK-0349-session-management-export-import.md) |
| `TASK-0341` | `verifying` | — | [浏览器运行时探测缓存与并发去重](TASK-0341-browser-runtime-probe-cache.md) |
| `TASK-0339` | `verifying` | — | [browser_tab 可纠正错误与有界止损](TASK-0339-browser-tab-correctable-errors-stop-loss.md) |
| `TASK-0329` | `blocked` | PLAN-0019 | [GitHub 与 CI 只读信号采集](TASK-0329-readonly-signal-collection.md) |
| `TASK-0321` | `verifying` | — | [预算受限下收敛 CI 触发面](TASK-0321-ci-budget-trigger-slimming.md) |
| `TASK-0319` | `verifying` | — | [侧边栏入口改名：「能力」→「技能与连接器」，「设计」→「原型设计」](TASK-0319-sidebar-nav-labels.md) |
| `TASK-0318` | `verifying` | — | [桌面端「智能客服」直连 WeKnora](TASK-0318-weknora-customer-service.md) |
| `TASK-0308` | `verifying` | — | [doctor 双出口：openforge doctor 子命令与诊断包解析记录（REQ-0016 A2）](TASK-0308-doctor-cli-and-diagnostics-export.md) |
| `TASK-0307` | `verifying` | — | [受管编码工具 inspect() 解析记录与缓存侧 version 标记（REQ-0016 A1）](TASK-0307-managed-tool-inspect-and-version-marker.md) |
| `TASK-0306` | `verifying` | — | [模型设置页脚显示运行时真实配置路径（BUG-0130）](TASK-0306-models-config-path-footer.md) |
| `TASK-0303` | `verifying` | — | [BUG-0128 归因修订（DSH 定案）与仓库根完整性标签全树重置](TASK-0303-bug0128-attribution-revision-and-root-reclaim.md) |
| `TASK-0302` | `verifying` | — | [dev 启动前自愈 Electron 二进制的 Low 完整性标签（保留 Chromium 沙箱）](TASK-0302-dev-electron-integrity-label-self-heal.md) |
| `TASK-0301` | `verifying` | — | [dev 启动器对 GPU 沙箱 FATAL 自动回退一次](TASK-0301-dev-gpu-sandbox-auto-fallback.md) |
| `TASK-0287` | `verifying` | — | [session-interrupt 健康判据识别「主控等子代理」，消除长任务全程误报](TASK-0287-interrupt-health-subagent-wait.md) |
| `TASK-0286` | `verifying` | — | [team 链 IPC 错误接入 describeError 翻译层，消灭 [object Object]](TASK-0286-team-ipc-error-translation.md) |
| `TASK-0285` | `verifying` | — | [团队会话 send 路径对 runtime 损坏态自愈或给出可读恢复指引](TASK-0285-team-send-self-heal.md) |
| `TASK-0284` | `verifying` | — | [收尾重配对 runtime 未加载的成员会话幂等化](TASK-0284-team-reconfig-idempotent-dispose.md) |
| `TASK-0282` | `verifying` | — | [远端资源读取观测：计数与累计耗时（零行为变更）](TASK-0282-remote-resource-read-observability.md) |
| `TASK-0281` | `verifying` | — | [插件 Hook 派发的双侧结构化取证（零行为变更）](TASK-0281-plugin-hook-bilateral-diagnostics.md) |
| `TASK-0280` | `verifying` | — | [消息列表重复 key 的结构化诊断（零行为变更）](TASK-0280-conversation-key-diagnostics.md) |
| `TASK-0279` | `verifying` | — | [续跑条忙碌期间不可点：在途锁、忙碌文案与主进程真值门控](TASK-0279-resume-bar-busy-gating.md) |
| `TASK-0278` | `verifying` | — | [握手失败后的 Client 销毁不再让 error 逃逸为全局未捕获异常](TASK-0278-ssh-handshake-error-guard.md) |
| `TASK-0277` | `verifying` | — | [技能展示读取不再把远端绝对路径当本机路径](TASK-0277-remote-skill-presentation-read.md) |
| `TASK-0276` | `verifying` | — | [终端 owner 与事件订阅的生命周期监听器成组解绑](TASK-0276-terminal-lifecycle-listener-release.md) |
| `TASK-0275` | `verifying` | — | [report-canvas 展示描述改用 Schema 支持的 canvas 枚举](TASK-0275-report-canvas-canvas-enum.md) |
| `TASK-0273` | `verifying` | — | [eform-craft 三版块团队化（REQ-0015 实施）](TASK-0273-eform-team-preset.md) |
| `TASK-0272` | `verifying` | — | [eform-craft 电子表单还原预置插件（REQ-0014 一期实施）](TASK-0272-eform-craft-preset.md) |
| `TASK-0271` | `verifying` | — | [ac-blackbox 自测中通道失效降级路径（技能合同补漏）](TASK-0271-ac-blackbox-channel-failure-degradation.md) |
| `TASK-0270` | `verifying` | PLAN-0003 | [修复文档站生产访问与搜索链路](TASK-0270-docs-site-runtime-routing-search.md) |
| `TASK-0269` | `ready` | PLAN-0014 | [重进运行中会话的排队消息显示（对照上游 61072cbb3，defer 至依赖收口）](TASK-0269-reentry-queued-messages.md) |
| `TASK-0268` | `ready` | PLAN-0014 | [自动压缩改为回复内步骤（同步上游 0.5.64，defer 至依赖收口）](TASK-0268-compaction-in-reply-step.md) |
| `TASK-0267` | `verifying` | PLAN-0014 | [模型拉取参数回填与选择体验（同步上游 0.5.63）](TASK-0267-model-pull-param-backfill.md) |
| `TASK-0266` | `verifying` | PLAN-0014 | [Responses/Codex 传输方式设置（同步上游 0.5.62 传输面）](TASK-0266-responses-transport-setting.md) |
| `TASK-0265` | `verifying` | PLAN-0014 | [插件模型图像输入能力保留（对照上游 c8fa6fbe2）](TASK-0265-plugin-model-image-capability.md) |
| `TASK-0264` | `verifying` | PLAN-0014 | [流式回复写完后末尾短语立即恢复全亮（同步上游 22293f956）](TASK-0264-streaming-tail-phrase-restore.md) |
| `TASK-0263` | `verifying` | PLAN-0014 | [网关流内瞬时错误标记可重试（同步上游 0.5.62）](TASK-0263-gateway-stream-transient-retry.md) |
| `TASK-0262` | `verifying` | — | [压缩提交前排空在途追加并刷新版本，消除与事件循环的版本竞态](TASK-0262-compaction-version-race.md) |
| `TASK-0261` | `verifying` | — | [续跑条改用 runtime session id：拆开门控与宿主调用的语义](TASK-0261-resume-bar-runtime-id-seam.md) |
| `TASK-0260` | `verifying` | — | [团队会话删除改为删除优先：清理失败降级记录、不再掀翻删除](TASK-0260-team-session-delete-robust-cleanup.md) |
| `TASK-0259` | `verifying` | — | [品牌档位相关测试断言改为引用品牌事实源](TASK-0259-brand-profile-test-assertion.md) |
| `TASK-0252` | `verifying` | — | [Desktop i18n 组合词归一与防回退门禁](TASK-0252-desktop-i18n-brand-composition-guard.md) |
| `TASK-0251` | `verifying` | — | [系统插件文案与导出产物使用宿主品牌](TASK-0251-system-plugin-brand-copy.md) |
| `TASK-0250` | `verifying` | — | [runtime-node 用户可见报错与工具描述去遗留品牌名](TASK-0250-runtime-user-visible-brand-strings.md) |
| `TASK-0249` | `in_progress` | — | [agent 身份行与 CLI 指引按品牌档位渲染](TASK-0249-agent-identity-and-cli-guidance-brand.md) |
| `TASK-0248` | `verifying` | — | [dev:electron 启动前校验并自愈 Electron 二进制](TASK-0248-electron-binary-dev-guard.md) |
| `TASK-0241` | `verifying` | — | [修复团队会话失败终态的同步渲染循环（BUG-0101）](TASK-0241-team-error-state-update-loop.md) |
| `TASK-0240` | `verifying` | — | [SSH 远程项目文件传输（上传/下载）](TASK-0240-ssh-file-transfer.md) |
| `TASK-0239` | `verifying` | — | [updater 检查错误分类：无 feed 配置与 feed 404 降为「配置不可用」结论](TASK-0239-updater-expected-check-errors.md) |
| `TASK-0238` | `verifying` | — | [Windows CLI shim 目标占用降级：内容等价静默跳过、真差异有界重试 + warn 降级](TASK-0238-cli-shim-eperm-degrade.md) |
| `TASK-0237` | `verifying` | — | [allstar-coding 补 fs.read/fs.write 权限声明：fence-log 追加与 state.md 兜底恢复可用](TASK-0237-allstar-fence-fs-permissions.md) |
| `TASK-0236` | `verifying` | — | [诊断日志统一抛值序列化：新增 describeError 并接入三处丢信息站点](TASK-0236-log-error-serialization.md) |
| `TASK-0235` | `verifying` | — | [会话文件锁协议强化：退避放宽、持有期心跳、超时携带持有者信息](TASK-0235-conversation-file-lock-hardening.md) |
| `TASK-0234` | `verifying` | — | [内置浏览器导航 API 迁移到 `navigationHistory`](TASK-0234-webcontents-navigation-history.md) |
| `TASK-0233` | `verifying` | — | [代理设置文本提交加有效性门](TASK-0233-proxy-invalid-commit-gate.md) |
| `TASK-0232` | `verifying` | — | [assertCapability 区分「未被认领」与「能力被拒」两类错误](TASK-0232-delete-capability-error-split.md) |
| `TASK-0231` | `verifying` | — | [异步上下文投递瞬态拒绝时记录降级为 next-turn 投递](TASK-0231-continuation-context-preserve.md) |
| `TASK-0230` | `verifying` | — | [transformMessages 尾部孤儿 tool_calls 补合成结果](TASK-0230-transform-tool-calls-tail-flush.md) |
| `TASK-0229` | `verifying` | — | [内置浏览器 detached view 上限 + LRU 驱逐](TASK-0229-browser-view-lru-eviction.md) |
| `TASK-0228` | `verifying` | — | [team 成员 runtime 恢复按成员隔离失败：成功保留、失败留旧条目、自身半成品回收](TASK-0228-team-member-restore-isolation.md) |
| `TASK-0227` | `verifying` | — | [recovery_required 的入坞恢复：存首因 + 下一次 admission 经 resumeSession 原地收敛](TASK-0227-session-recovery-admission.md) |
| `TASK-0226` | `verifying` | — | [team 会话降级删除：coordination 文档读不出时仍清理索引、运行时与状态](TASK-0226-team-session-degraded-delete.md) |
| `TASK-0225` | `verifying` | — | [内置浏览器拖拽穿透：Electron 无 per-view ignore-mouse，穿透期改由隐藏 view 让位](TASK-0225-browser-view-passthrough-target.md) |
| `TASK-0224` | `verifying` | — | [dev 与打包默认品牌口径切换为外部分发（Allstr ai / 小爱ai）](TASK-0224-brand-profile-default-distribution.md) |
| `TASK-0223` | `verifying` | — | [给流式停滞加专用重试上限：死 provider 连接不再烧满 30 分钟瞬态预算](TASK-0223-turn-terminal-stall-bound.md) |
| `TASK-0222` | `verifying` | — | [受控投影判等只看文本可承载身份：修复 team 输入框引用文件后与用户抢键盘](TASK-0222-team-composer-token-input-fight.md) |
| `TASK-0221` | `verifying` | — | [消除 render 日志的 React flushSync 生命周期 DEV 噪音，并移除第一方 flushSync](TASK-0221-renderer-flushsync-dev-noise.md) |
| `TASK-0220` | `verifying` | — | [修复 BUG-0082：ac-fence 黑盒白名单复合命令绕过与读域 .. 穿越](TASK-0220-ac-fence-blackbox-bypass-fix.md) |
| `TASK-0219` | `verifying` | — | [allstar-coding 黑盒环节升级：能力探测 → 三态分流 → 自测（可选）→ 用户核验](TASK-0219-blackbox-selftest-iteration.md) |
| `TASK-0218` | `verifying` | — | [Browser 能力判断与缺失会话恢复指引](TASK-0218-browser-capability-evidence.md) |
| `TASK-0197` | `in_progress` | PLAN-0015 | [Harness 能力吸收批次隔离工作树](TASK-0197-harness-absorption-batch.md) |
| `TASK-0195` | `blocked` | PLAN-0015 | [保留兼容模型请求前缀的摘要生成](TASK-0195-prefix-preserving-compaction.md) |
| `TASK-0184` | `verifying` | — | [修复 docs-site 构建的 Turbopack 报错](TASK-0184-docs-site-build-repair.md) |
| `TASK-0183` | `verifying` | — | [修复 packaged E2E 的 CI 连续红](TASK-0183-packaged-e2e-ci-repair.md) |
| `TASK-0169` | `verifying` | PLAN-0014 | [SSH 配置失效与实时连接状态](TASK-0169-ssh-connection-lifecycle.md) |
| `TASK-0166` | `verifying` | PLAN-0014 | [SSH helper 可恢复失败与首次可用测量](TASK-0166-ssh-helper-recovery-measurement.md) |
| `TASK-0165` | `verifying` | — | [修复 ssh2 新主机交互认证：握手预算与 KI 口令回退](TASK-0165-ssh2-interactive-auth-budget.md) |
| `TASK-0153` | `verifying` | PLAN-0014 | [SSH 本地进程组取消的选择性适配](TASK-0153-ssh-selective-transport.md) |
| `TASK-0130` | `verifying` | — | [托管 runtime 的 zip 解压改走内置解压器，不再依赖外部 tar](TASK-0130-runtime-zip-extract-without-tar.md) |
| `TASK-0127` | `blocked` | — | [修改声明头存量缺失一次性 sweep](TASK-0127-modified-file-notices-sweep.md) |
| `TASK-0125` | `blocked` | PLAN-0013 | [团队编排效率回归实测：rebase 上游 + 阶段 1 后同任务量化对比](TASK-0125-team-orchestration-rebaseline.md) |
| `TASK-0107` | `verifying` | PLAN-0010 | [后台进程统一健康/重启/记账契约 + unresponsive 栈采样](TASK-0107-background-process-health-contract.md) |
| `TASK-0050` | `verifying` | PLAN-0002 | [transcript 窗口化第 2 步：beforeEntry 游标分页](TASK-0050-transcript-cursor-pagination.md) |
| `TASK-0048` | `in_progress` | PLAN-0003 | [公开文档站品牌、正文与发现入口迁移](TASK-0048-docs-site-brand-migration.md) |
| `TASK-0047` | `verifying` | PLAN-0003 | [仓库文档与协作入口品牌迁移](TASK-0047-repository-docs-brand-migration.md) |
| `TASK-0042` | `verifying` | PLAN-0002 | [powerMonitor 定向清理：suspend/lock-screen 免费收缩点](TASK-0042-powermonitor-suspend-trim.md) |
