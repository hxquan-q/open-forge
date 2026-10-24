---
id: REQ-0028
type: requirement
status: ready
priority: P1
owner: coding-agent / desktop-plugins
source: 用户要求调查当前插件系统、适配Pi生态并提出优化方案（2026-10-22）
created: 2026-10-22
updated: 2026-10-22
related_plan: [PLAN-0022]
related_research: [RESEARCH-0040]
related_tasks: []
---
<!-- Copyright The Open Forge contributors. -->

# Pi 生态接入与原生插件演进

## 用户问题

Open Forge已有自己的桌面插件、Coding Extension、Skill、MCP和市场系统，但这些能力不等于可直接安装Pi生态包。用户希望复用Pi资源和扩展，同时保留自身桌面插件的优势，并让安装、兼容性、失败和恢复行为容易理解。

## 用户结果

- 在插件管理入口选择一个Pi来源，执行代码前看见包版本、资源、信任要求和已知兼容限制。
- 明确区分“已获取”“已启用”“已就绪”“受限运行”“不支持”；支持的能力能够跨会话使用和撤销。
- 项目A启用的扩展不会自动进入项目B；Worktree继承策略明确，来源与实际执行版本可追溯。
- 原生桌面插件保留React UI、工具、Hook、Skill、MCP和工作台能力，改进持久恢复、加载响应及诊断。

方案：[PLAN-0022](../plans/PLAN-0022-pi-ecosystem-and-plugin-evolution.md)。外部固定版本和生态样本：[RESEARCH-0040](../research/RESEARCH-0040-pi-extension-ecosystem-compatibility.md)。本轮只形成研究和候选方案，不授权运行第三方扩展或改变当前信任模型。

## 范围

1. 版本化Pi资源/行为兼容合同，保留既有兼容profile，明确目标版本和宿主限制。
2. 来源解析、精确版本锁定、非执行预检、显式授权、安装/启停/升级/恢复完整流程。
3. 优先Skills、prompt templates和宿主中立的工具/事件；按实际需求再扩展会话控制、结构化交互和Provider。
4. 原生插件的无界面贡献路径、安装恢复、生命周期诊断与加载隔离优化。
5. 固定版本真实生态样本与合成边界fixture共同构成兼容矩阵。

## 不做什么

- 不承诺所有Pi扩展、TUI组件、终端主题或快捷键自动变成桌面React UI。
- 不嵌入第二套Pi Agent/Session运行核心，不以包名alias代替行为兼容。
- 不把同进程/子进程/worker或SDK权限称为任意第三方代码的安全沙箱。
- 首批不自动扫描并执行用户全局Pi目录，不自动更新到浮动latest。
- 本轮不实施、安装依赖、启动真实Desktop、调用Provider、提交或发布。

## Given / When / Then

| Given | When | Then |
|---|---|---|
| 固定版本、只有Skill/提示词的Pi包 | 预览、选择资源、启用并重启 | 不执行包JS即可导入；资源、版本、项目范围可追溯 |
| 处于受支持profile的工具扩展及明确代码信任选择 | 安装、调用、取消、重启后再调用 | 参数、结果、错误、取消及状态持久化符合合同；无未授权宿主能力扩大 |
| 包含unsupported API或必需TUI功能的扩展 | 预检或加载到该能力 | 给出具体限制；不静默删掉关键行为后宣称兼容 |
| 同名工具或跨项目配置 | 启用/切换项目 | 冲突显式解决，不静默覆盖，不把A的私有配置带到B |
| 更新失败、部分注册、旧Turn仍执行 | 加载新版本或禁用旧版本 | 失败回滚和generation lease有效；新旧处理器不串代 |
| 断电式中断安装或注册表损坏 | 重启恢复 | 能识别并恢复最后完整状态，损坏不静默伪装成空安装列表 |

## 必须保持

- apps → coding-agent/runtime → kernel的依赖方向；Pi类型不进入Runtime公共协议。
- 单一领域事实源、现有Turn generation及普通retirement/hard revoke的区别。
- 消息角色、工具调用、错误、usage/stop、取消和会话持久化语义。
- 用户已有插件、旧格式、已撤销权限、原生Module Federation插件行为；权限更新不自动扩大授权。
- 外部包、安装脚本、源码和配置是待校验数据；静态扫描不是完整行为证明。
- 用户对代码信任、模型费用和真实UI运行的选择必须明确，安装行为不能暗示已完成安全隔离。

## 验收标准

1. 指定目标Pi版本、profile、支持API与宿主矩阵，并明确样本分母；没有运行证据不发布兼容率。
2. 至少一条普通Desktop入口完成“选择包→预览→授权→启用→调用→重启→禁用”的连续闭环。
3. 会话条目/状态、版本升级、工具冲突、失败回滚、跨项目隔离和旧版本保留有可复算证据。
4. 原生插件安装持久化与加载超时各有故障注入验证，诊断能关联包、版本、activation和执行generation。
5. 纯代码合同、真实生态集成、平台证据、模型质量和人工接受分别记录，不互相替代。

## 风险与失效条件

Pi API和生态依赖会演进；动态import、内置Node API和外部CLI无法仅靠静态预检穷尽。当前原生插件是可信代码模型，扩大市场不能自动沿用“官方preset”的信任级别。若产品要求任意第三方代码受限执行，需要独立威胁模型与OS能力设计，重新评估首批范围。
