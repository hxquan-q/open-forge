---
id: TASK-0031
type: task
status: done
priority: P0
owner: apps/desktop
requirement: REQ-0002
plan: PLAN-0002
source: RESEARCH-0004 P0-3
execution: serial
branch: forge/dev
worktree: unassigned（forge/dev 主工作区串行执行）
base_commit: forge/dev
read_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/main]
write_paths: [apps/desktop/src/renderer/domains/conversation, apps/desktop/src/main, .github/release-notes]
exclusive_paths: []
depends_on: []
conflicts_with: []
integration_status: integrated
created: 2026-09-23
updated: 2026-09-23
---

# 工具结果 base64 媒体引用化

## 目标

`chat-service.ts` fullHistoryToChat 把工具结果图片/音频提取为 base64 data URL 常驻消息块，10 条图片工具结果会话可达数百 MB。改为消息块只存自定义协议引用、按视口从主进程按需取字节；解码 bitmap 由 Chromium 图片缓存随视口管理。

## 方案边界（设计 agent 产出后回填）

- 复用/扩展现有自定义协议模式（media-protocol/file-protocol 先例）；
- 旧会话 base64 data URL 直接渲染（`data:` 前缀检测），不迁移旧数据；
- MCP 单调用 16 项/8MB/24MB 上限语义不变；
- 复制/导出/放大等消费方行为不变。

## 并发结论

支持（renderer conversation + main 协议区）；设计进行中。

## 实施摘要（2026-09-23）

- 共享投影 `src/shared/conversation/tool-media-projection.ts`：候选收集/过滤/URL 构造双侧共用，index 对齐为合同；渲染端与主进程均引用同一实现。
- 消息块 `data` → `src`（`content-blocks.ts`）；提取器带 `media` 上下文产出 `vetta-media://toolcall/<sessionId>/<toolCallId>/<index>?kind=`，无上下文（viewer 预览三流、阶段一）回退 `data:` 内联，图片永远可见。
- 主进程 `toolcall-media-resolver.ts`：活动会话内存 → streaming 50ms 单次重试 → 会话 JSONL 文件（三个内置根 + 项目 `.vetta/sessions`）双路解析；64MB/256 条 LRU；协议分支返回 immutable 缓存头 + Range 支持（bitmap 生命周期交给 Chromium 缓存）。
- 穿线：useSessionOpener/useUserMessageActions/useSessionMessageSender/useSessionEventController（tool.end 与两处 projectHistory）/conversation-projection/teamChatModel（成员会话 runtimeSessionId）。
- 与设计偏差：viewer 三流阶段一回退 base64（openViewer 增强 sessionId 留待后续）；team 直播流 tool 执行事件（DesktopTeamToolExecutionEvent 只有 team 会话 id）阶段一同样回退，重载/历史路径已引用化。
- 验证：resolver 3 用例（含 svg 过滤序号对齐、文件回退、LRU 计数）+ 协议分支 2+1 用例 + 提取器 2 用例（新增引用化断言）+ mcp-image 组件 2 用例全绿；`tsc -p apps/desktop` 通过（并行会话在途文件除外）；scoped `check:quick` 通过。media-protocol.test 两个「远程项目」用例为历史 Windows 环境失败（POSIX tmpdir 拼 SSH URI），与本次无关。
