---
id: WAIVER-0012
rule: project/collaboration/development-workflow.md 的全跨包 test:changed 全绿后才集成并推送开发候选的 Policy
status: active
owner: coordinator
reason: 用户在已明确告知跨包回归仍红及实机未验证后，于 2026-10-28 要求提交推送并合入 main，随后明确允许一并提交当前在途文档；本批按该次明确指令交付开发候选，保留全部失败事实
risk: 广域 CLI/文件锁/远端 Desktop 失败尚未全部归因，局部通过不能证明组合风险为零；画布真实首屏和跨进程输入未验收
compensation: 固定 TASK-0406 的 51ed65dcc 与 TASK-0407 的 c53ad5e7e，按序合入本地 main；逐次运行影响测试与完整 check，并补 MCP 宿主消费者测试和画布全包复验；保留前轮 test:changed 红灯及同基线对照，不修改断言/超时/门禁或伪报通过；仅普通推送 Task 分支及 origin/dev，不触碰 origin/main、upstream、tag、Release 或制品发布
created: 2026-10-28
expires: 2026-11-11
---
<!-- Copyright The Open Forge contributors. -->

# 用户确认的 MCP/画布开发候选集成

授权原文：“提交推送，然后合并入main”；关于主工作区的共享文档，用户选择“允许，一并提交当前文档（推荐）”。此前已说明 MCP 跨包回归整体红、画布实机验证未运行，候选和测试证据见 TASK-0406/0407。

本条仅登记本次测试流程 Policy 例外，不豁免任何 Invariant。合并后的定向/影响测试或完整 check 若出现新失败，先修复或保留阻断，不借本条绕过。上轮完整跨包运行的失败结果继续有效，本次不重复长时间扫描已知失败的整个集合；实际采用的补偿验证逐项写回 Task。

待推 main 批次另含已独立验证的项目迁移提交 46785aaac（TASK-0361，75 例定向、29 例 UI 夹具、impact 与完整 check 已有交付记录）及 6ebd359b5 的立项文档。必须审核整个待推集合，不夹带 0408/0409 的未验收实现；它们本轮仅提交用户同意纳入的台账文档。功能状态继续 verifying，不把 Git 集成视为人工验收。到期不自动续期；基线失败解决或本批后续验收完成时由 Coordinator 关闭。
