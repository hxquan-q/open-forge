<!-- Modified by The Open Forge contributors. -->
# 参与 Open Forge

[English](CONTRIBUTING.md) · [简体中文](CONTRIBUTING.zh-CN.md)

本仓接受客户端工程的贡献：桌面及配套应用、Agent 运行时、模型、扩展和文档。业务服务端变更独立维护。

## 找到内容归属

| 改动 | 位置 |
| --- | --- |
| 桌面界面或宿主行为 | `apps/desktop/` |
| CLI、移动端或传输应用 | `apps/` 中拥有该行为的目录 |
| 可复用 Agent、模型、运行时或能力 | `packages/` 中拥有该行为的包 |
| 插件或主题 | `packages/plugins/` 或 `packages/themes/` |
| 用户使用说明 | `apps/docs-site/content/docs/` 及其 `en/` 镜像 |
| 工程手册 | `docs/` 对应章节 |
| 需求、任务、缺陷与验证 | `project/` |

可通过[文档导航](docs/README.md)确定所有者。应用依赖包，包不反向引用应用内部代码；跨包导入使用公开的 `package.json#exports`。

## 开始修改

1. 阅读 [AGENTS.md](AGENTS.md) 及目标目录最近的规则和 README。
2. 按[快速开始](QUICKSTART.zh-CN.md)使用 Bun 安装依赖。
3. 查找或建立对应的 [Project Task](project/tasks/README.md)，在实施前记录范围、预期行为与验证方式。
4. 一次变更只处理一个 concern。缺陷或行为变化补充回归测试；纯文档核对事实、命令与链接。

Desktop 用户可见文案（包括可访问性文本）走 i18n，快捷键进入可配置 keybinding。生成文件修改生成器或事实源。

## 验证与提交

按[质量门禁](docs/dev/quality-gates.md)和[测试政策](docs/dev/agent-rules/testing.md)选择受影响测试。完成代码任务后执行规定的完整 `bun run check`，该命令不运行测试。Desktop UI 验证仅在当前任务明确要求时运行。

更新当前开发版本的[发布说明](.github/release-notes/README.md)。公开文档同步中英文，检查新增或改动的链接。

开发 PR 发往 **`dev`**，按仓库模板说明问题、修改后的行为与实际验证，关联 Task 或 Issue。提交使用中文多行说明，保留其他贡献者的修改。分支和集成流程见[开发流程](project/collaboration/development-workflow.md)。

不要提交密钥、用户会话、生产配置、默认开启的新遥测目的地或未经同意的依赖迁移。插件权限必须显式声明，限制在本次能力需要的范围。

## 反馈与安全

协作入口以[本仓 GitHub 页面](https://github.com/hxquan-q/open-forge)实际启用的渠道为准。反馈可复现问题时提供版本、平台、步骤、期望结果与实际结果；脱敏后的证据也可记录在对应 Project Task。

安全漏洞按[安全策略](SECURITY.md)处理，不在公开 Issue 或 PR 中披露敏感细节。

## 许可

贡献采用 [Apache-2.0](LICENSE) 许可。保留既有版权及第三方声明，详见 [NOTICE](NOTICE)。
