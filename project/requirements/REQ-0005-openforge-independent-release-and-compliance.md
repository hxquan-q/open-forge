---
id: REQ-0005
type: requirement
status: ready
priority: P0
owner: release/desktop
source: user-request
created: 2026-09-23
updated: 2026-09-23
related_plan: [PLAN-0005]
related_issues: [ISSUE-0007, ISSUE-0008, ISSUE-0009]
---
<!-- Copyright The Open Forge contributors. -->

# Open Forge 独立发布与二开合规

## 用户问题

当前 fork 仍沿用上游 Desktop 版本字段与部分发布文案；Desktop 与 workspace 包存在不同版本流，发布脚本却包含锁步假设。源码、NOTICE 和桌面发行包的许可证可见性及品牌身份也没有形成一个可验证的发布合同。

## 用户结果

Open Forge 可以使用自己的 Desktop SemVer 独立发布，并能追溯其上游代码基线；用户从源码或安装包取得适用的许可证和归属信息；产品身份清楚地区分 Open Forge 品牌与为兼容性保留的 Vetta 技术标识；上游同步和发布过程可审查、可验证且不会意外推送。

## 范围

- 建立 Desktop 产品版本、Git tag、更新制品和 Open Forge Release Notes 的一致合同；上游基线 commit 单独记录。
- 将 Desktop 发布与 workspace/公开包发布分开管理，不假定所有 package 采用锁步版本。
- 核实 Apache-2.0 与实际打包第三方组件的许可证、NOTICE 和发行物交付路径。
- 为公开品牌、技术兼容标识、更新源、协议、凭据和存储身份维护明确的批准状态与迁移说明。
- 固化上游同步、改动归属、差异回归和 Task 集成规则。

## 不做什么

- 本需求不预选 Open Forge 首发的具体版本号，不创建 tag、不发布、不推送。
- 不注册域名、npm 组织或外部服务，不执行 npm publish。
- 不盲目替换 `APP_RUNTIME_NAME`、`@vetta/*`、`VETTA_*`、`vetta:`、`.vettapkg` 等兼容标识。
- 不假设 Apache-2.0 要求独立插件开源；复制或改写许可代码及其他第三方组件的义务另行核验。

## Given / When / Then

- Given：仓库包含上游 Open Vetta 代码、Open Forge 专属改动、Apache-2.0 与第三方组件；When：维护者准备源码或 Desktop 发行包；Then：版本和上游基线可区分，更新源指向 Open Forge，发行物附带适用的许可证/归属材料，用户看到批准的 Open Forge 品牌，保留的兼容身份有明确理由。

## 必须保持

- Apache-2.0 原文和适用的上游版权、归属与 NOTICE 信息不得被品牌迁移误删。
- 发行包、公开包和应用运行身份按各自合同处理，不用一个版本号或品牌值覆盖所有层。
- `APP_RUNTIME_NAME` 与凭据密钥定位的兼容关系保持不变，除非另有经批准和验证的迁移方案。
- 任何发布、tag、push、registry 发布均需明确授权；此需求不授权真实发布。

## 验收标准

- Desktop 发布脚本具有无远端副作用的准备阶段和显式授权的发布阶段；workspace 发布入口不会静默覆盖不同版本的 package。
- Desktop staging 与发布合同测试证明 `LICENSE` 和 `NOTICE` 被放入每个平台可读取的发行布局；第三方清单覆盖实际随包分发的二进制/模型。
- 用户可见 Desktop 品牌不再误称 Vetta；兼容标识按身份矩阵保留，且相关测试通过。
- 上游同步流程区分可回馈上游、Open Forge 专属和兼容层改动，并在同步后运行行为合同验证。
- 首发版本基线和 Apache §4(b) 文件修改声明策略未决期间，发布保持阻断，不修改上游已发布 Release Notes。

## 风险与失效条件

- 首发成熟度、具体版本号和预发布版本语法仍待 ISSUE-0007 决策。
- Apache-2.0 §4(b) 对大型 fork 中“修改文件”声明的实施方式及 Open Forge 修改版权归属需由有权负责人确认；不得由实现者虚构权利人。
- 第三方 NOTICE/许可证义务随打包组件变化；仅检查仓库根文件不足以证明二进制发行物合规。
