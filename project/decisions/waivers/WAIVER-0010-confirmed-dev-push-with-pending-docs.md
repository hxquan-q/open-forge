---
id: WAIVER-0010
rule: project/collaboration/development-workflow.md 的开发候选推送前 main 工作区必须干净
status: resolved
owner: coordinator
reason: 用户于 2026-10-28 明确确认仅推送已提交的 6ebd359b5 与 46785aaac 到 origin/dev，并保留其他会话在途文档不动；无法通过清理他人工作来满足干净工作区前置条件
risk: 在途文档可能影响工作区检查，且并行会话可能继续移动 main；不能将未经确认的新提交或未提交内容视为本次推送范围
compensation: 固定目标 46785aaacdb868ffc20a8d28e4f8e0804a770f24，审核远端到该目标的完整提交集合；确认未提交变更仅管理文档，运行 test:changed 与完整 check；只做普通 fast-forward 推送到 refs/heads/dev，禁止 force、tag、origin/main、暂存清理或移动他人修改；目标及远端变化时重新核对
created: 2026-10-28
expires: 2026-10-29
---
<!-- Copyright The Open Forge contributors. -->

# 单次开发候选推送：保留并行文档，限定已确认提交

关联 [TASK-0361](../../tasks/TASK-0361-project-migration-archive.md)。本条只豁免工作区干净这一 Policy 前置条件，不豁免测试、提交归属、用户授权、fast-forward 或稳定分支保护。

用户已明确确认两个提交一起推往 `origin/dev`，其余未提交修改保持原样。已核对目标的父链为 `origin/dev@9f4b87ee8 → 6ebd359b5 → 46785aaac`；`6ebd359b5` 只有已提交的 MCP/设计立项文档，不包含其后在途代码。

本登记不进入本次远端提交集合，避免为推送回执增加第三个提交。登记文件保留在本地；成功或中止后将本单次授权标记 resolved 或 revoked，不自动续期。后续其他批次仍执行常规干净工作区流程。

2026-10-28：用户随后明确同意将当前在途文档一并提交；主工作区可先恢复干净，故本条“保留脏文档推送”的例外不再需要，标记 resolved。原限定目标仍作为历史记录，不将此状态冒充该目标已经推送；当前 MCP/画布集成按 WAIVER-0012 的单次明确授权和补偿验证执行。
