---
name: build-release-and-rollback
description: "准备/核对 AIMES CustomDev 完整 dev 测试集成包、测试服务器更新验收或回滚时调用。当前不做生产 main PR、生产打包发布部署；缺远程能力/操作资料时只交付产物与步骤。"
---
<!-- Copyright The Open Forge contributors. -->

# 测试构建、更新与回滚

领域制品与验收方法，Git 调度/权限/配置读取按 Agent 共享操作合同，不在 Skill 另建操作门禁。当前范围仅 dev 测试包与测试服务器，不含生产。

## 构建证据

核对实际集成提交、干净状态、目标 profile、配置加载、端口/服务身份及目标测试环境。目标是 PR 合入 dev 的完整 CustomDev 前后端二开包，不是本次局部模块包；记录提交、命令、时间、产物与摘要，区分配置推断和实际成功结果。

2026-11-06 工作区核实材料仅阅读了构建配置，未实际构建：

- 后端 common/server/api Maven reactor，Java 25、Spring Boot 4.1.0；POM 的 package 阶段指示 `server/target/custom-dev-server.jar`、lib、lib_ai_mes、resources 等输出。JAR manifest Main-Class 指启动类，Class-Path 前缀 lib/，是非 fat JAR；application-*.yml 被排除而 bootstrap.yml 仍在 JAR，resources 会复制源资源。
- `mvn package` 是配置层面的候选入口，不等于 Codeup 精确命令已获确认；先检查当前 POM/脚本与已核实流程，不能假装 pipeline 已运行。
- 前端 npm run build（vue-tsc && vite build）输出 web-ui/dist；按当前依赖锁文件与目标工程工具链运行，不将 Vetta 的 Bun 规则移植过来。VITE_* 会进入浏览器产物，不能存秘密。
- lib_ai_mes/resources 是否随包部署及加载优先级按实际启动脚本确认，不只覆盖 JAR 遗留旧依赖，也不凭目录存在就猜文件替换清单。端口/base 等仅 [项目事实](../project-architecture-and-runtime-map/SKILL.md) 保存观察。

## 测试更新与回滚

1. 部署前核实目标目录、进程/服务归属、运行 Java 版本、配置来源、停止/启动与回滚路径；Java 25 需求需与当前制品核对，不假定服务器已满足。
2. 备份目标制品/必要状态，保留可恢复版本；只停目标 CustomDev 服务，不误停同机其他服务。
3. 按已确认清单替换完整后端依赖/资源与前端静态产物；不把秘密写回源码/前端变量/普通日志。
4. 启动后核对日志、端口、注册、DB/Redis、入口 HTML/JS/CSS、API、菜单/子应用和主要业务路径，配合测试角色验收完整 dev 集成包。
5. 记录版本、验收、备份路径和恢复条件；失败停止新版本，按核实方案恢复备份并复验，不能仅恢复 JAR 忽略对应依赖/静态资源。

无安全远程执行能力或目录/脚本/服务归属不明时，只准备构建产物和操作步骤，请用户操作，不猜目录/命令、不声称已部署。测试环境身份与数据源安全按共享合同，生产不在当前工作范围。

## Workshop 参考

旧 Workshop 使用 workshop-server.jar 与同级 lib，resources 需求取决于其 start.bat，dist 对应 /workshop/。这些是标准模块历史部署模式，非 CustomDev 服务器默认值；保留非 fat JAR/完整依赖/备份回滚方法，不搬目录、URL、端口或脚本。

来源：`eformSkill/构建发布与回滚`、Workshop 部署文档、Practice POM 参考与工作区 2026-11-06 CustomDev 构建配置核实；Codeup 和服务器事实仍待授权核验。
