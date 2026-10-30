---
id: BUG-0157
type: bug
status: verifying
priority: P0
owner: desktop-release
requirement: REQ-0002
source: user-request; desktop-release run 40303791764
related_requirement: [REQ-0002]
related_plan: []
related_tasks: [TASK-0405]
related_issues: [ISSUE-0029]
created: 2026-10-29
updated: 2026-10-29
---
<!-- Copyright The Open Forge contributors. -->

# Linux 发布校验写死旧品牌安装目录

## 用户流程与实际行为

Given：默认分发品牌的 Linux deb/rpm 构建完成。When：release workflow 验证 updater 和原生包，再安装到 Ubuntu/Fedora。Then：应按相同品牌合同检查二进制、package-type 和 desktop entry；实际包内检查要求旧 /opt/Open Forge，在进入安装检查前失败，后续安装脚本也重复旧目录。

## 环境与失败证据

https://github.com/hxquan-q/open-forge/actions/runs/40303791764 ，head 9f4b87ee81b6ec2aa7f1417d23d36745e2e1ac1d。Linux update files verified: 0.1.3 后报 Debian package is missing /opt/Open Forge/OpenForge，退出 1。四平台构建成功不代表 Linux verify 成功；安装和 packaged E2E 未运行。

## 根因与最小复现

prepare-pack 默认读取 desktop-brand.distribution.json，productName 为 Allstr ai，executableName 为 OpenForge。electron-builder 26.15.3 的 FpmTarget 将应用放入 /opt/${appInfo.sanitizedProductName}；可执行文件名不决定安装根。verify-linux-packages、workflow 容器检查及既有测试却写死 Open Forge。

向 verifyLinuxPackageInspection 传入版本、包名和架构正确，且 paths 包含 /opt/Allstr ai/OpenForge、/opt/Allstr ai/resources/package-type、desktop entry 和 hicolor icon 的两套检查结果，旧实现应错误拒绝。该复现基于生产配置和打包器调用链，尚未下载解包远端制品。

## 回归与修复

TASK-0405 已执行默认品牌回归 red：正确分发路径被旧实现以 Debian package is missing /opt/Open Forge/OpenForge 拒绝，退出 1。统一现有 linux-packaging-contract 的品牌路径后，Node 回归 6/6 通过，覆盖默认/self 档、跨品牌拒绝、deb/rpm 两种错误身份及缺文件；Ubuntu/Fedora 安装步骤通过引用的 Docker 环境变量共用路径，保留真实安装事务和严格检查。配套流水线合同 27/27 通过，加入发布身份守卫后组合定向 47/47 通过。独立只读评审 a5f933ea5c91b0e1a 未发现 Linux 修复的实质代码问题，后续 draft 身份复审亦已回收。第三次完整批次 quality 700 项及完整 check 通过，全部包测试已执行但因两个 Desktop 市场超时仍红，修后最终完整门禁待完成（TASK-0412/0414）；未执行真实 Linux 制品检查、容器安装或新远端 run，不以本地合同替代平台验收。
