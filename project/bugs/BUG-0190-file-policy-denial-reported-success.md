---
id: BUG-0190
type: bug
status: verifying
priority: P1
owner: packages/runtime-node
requirement: []
plan: []
source: user-request / workspace AUD-FILE-TOOL-ERROR-001
related_requirement: []
related_plan: []
related_tasks: [TASK-0488]
related_issues: []
created: 2026-11-17
updated: 2026-11-17
---
<!-- Copyright The Open Forge contributors. -->

# 文件工具路径拒绝被记录为成功

## 用户流程与实际行为

- Given Code文件工具在既有路径策略下执行read/write，When目标被策略拒绝，Then应明确失败、无文件副作用，并让执行器沿现有确定性错误合同统计；当前仅返回拒绝text，无isError/details.code，执行器误记成功。
- 源码基线 `26789eae694fc9b8c35cc72c2e82eac9c31b2940`，Windows/manifest0.1.4。read-tool.ts与write-tool.ts拒绝分支已静态核实；实际红灯已执行：read1、write受保护Skill2/wiki1共4目标均因isError实际undefined而失败（其余36例过滤跳过），非环境故障。

## 期望与最小复现

经真实工具registration执行注入拒绝policy的read/write，应返回保留原text、isError:true与details.code:policy_denied，无文件读写；允许路径保持正常成功。公共Runtime→Agent适配保留错误字段，同参连续拒绝按现有三次止损，新Turn/改参数仍按既有合同恢复。

## 影响与根因

P1错误合同可靠性缺陷，影响失败统计和自动止损；权限策略本身仍拒绝，不是隔离失效。RuntimeToolResult已有isError/details、适配器透传，执行器按isError===true识别，policy_denied已在止损白名单，因此最小责任边界是两份拒绝结果生产者。

## 修复与验证范围

TASK-0488先红后绿，只补两个拒绝结果字段，保留原拒绝文案、路径策略与正常输出；不改edit/shell/SSH、ENOENT/取消、不放开Skill或家目录。通过真实注册合同、Runtime错误结果透传及现有执行器止损流程验证，不跨包反向导入产品实现。

## 候选验证与交付

- 两份生产者拒绝分支已保留text并补isError:true/details.code:policy_denied；权限策略、正常读写、取消、review无改，Runtime/Agent生产透传无改。
- 四目标先红；修后真实注册read29/write12、Runtime引擎21、Agent止损13，共4文件75/75通过，六文件Biome检查exit0无改写。覆盖拒绝零I/O、拒绝后允许真实写、错误进入下一模型请求以及同参止损/改参与新Turn恢复。
- 独立只读review-file-error审查无本项阻断；完整bun run check仍由既有过期waiver/无关声明头与类型错误阻断。Task/索引通过，不修无关代码或降低门禁；verifying/integration pending保存候选，不宣称工程完成或集成。
- 未运行impact/全包/全量/live、UI/dev/真实Provider或安装依赖；临时根在授权工作区。A8读取资源权限另题，不以本项扩大范围。详细命令见TASK-0488。
